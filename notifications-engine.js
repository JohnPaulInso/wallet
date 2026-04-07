/**
 * Smart Wallet - Notifications Engine
 * Handles persistent notifications via Firestore and local mobile alerts.
 */

import {
    db,
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    limit,
    getDocs,
    where
} from "./firebase-config.js";

const NOTIFICATIONS_COLLECTION = "notifications";
const LOCAL_NOTIF_CACHE_KEY = "smartwallet_local_notif_cache_v1";
const LOCAL_NOTIF_LAST_SYNC_PREFIX = "smartwallet_local_notif_last_sync_";
const BUDGET_THRESHOLD_STATE_PREFIX = "smartwallet_budget_threshold_state_";

export const NotificationsEngine = {
    getLocalNotificationsPlugin() {
        return window.Capacitor?.Plugins?.LocalNotifications || null;
    },

    async ensureLocalPermissions() {
        const plugin = this.getLocalNotificationsPlugin();
        if (!plugin) return false;

        try {
            const status = await plugin.checkPermissions();
            if (status.display === "granted") return true;
            const requested = await plugin.requestPermissions();
            return requested.display === "granted";
        } catch (e) {
            console.warn("Local notification permission check failed:", e);
            return false;
        }
    },

    getLocalCache() {
        try {
            return JSON.parse(localStorage.getItem(LOCAL_NOTIF_CACHE_KEY) || "{}");
        } catch (e) {
            return {};
        }
    },

    setLocalCache(cache) {
        try {
            const trimmed = Object.fromEntries(
                Object.entries(cache)
                    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
                    .slice(0, 250)
            );
            localStorage.setItem(LOCAL_NOTIF_CACHE_KEY, JSON.stringify(trimmed));
        } catch (e) {
            console.warn("Failed to persist local notification cache:", e);
        }
    },

    getLocalNotifKey(uid, type, fallbackId = "") {
        return `${uid || "guest"}:${type || fallbackId || "general"}`;
    },

    wasDeliveredLocally(uid, type, fallbackId = "") {
        const cache = this.getLocalCache();
        return Boolean(cache[this.getLocalNotifKey(uid, type, fallbackId)]);
    },

    markDeliveredLocally(uid, type, fallbackId = "", createdAtMs = Date.now()) {
        const cache = this.getLocalCache();
        cache[this.getLocalNotifKey(uid, type, fallbackId)] = createdAtMs;
        this.setLocalCache(cache);

        if (uid) {
            const syncKey = `${LOCAL_NOTIF_LAST_SYNC_PREFIX}${uid}`;
            const current = Number(localStorage.getItem(syncKey) || "0");
            if (createdAtMs > current) {
                localStorage.setItem(syncKey, String(createdAtMs));
            }
        }
    },

    getCreatedAtMillis(data) {
        const createdAt = data?.createdAt;
        if (!createdAt) return 0;
        if (typeof createdAt.toMillis === "function") return createdAt.toMillis();
        if (typeof createdAt.seconds === "number") {
            return (createdAt.seconds * 1000) + Math.floor((createdAt.nanoseconds || 0) / 1000000);
        }
        const parsed = new Date(createdAt).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    },

    createNativeNotificationId(key) {
        const raw = String(key || `notif-${Date.now()}`);
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
            hash = ((hash << 5) - hash) + raw.charCodeAt(i);
            hash |= 0;
        }
        return Math.abs(hash % 2147480000) + 1;
    },

    sanitizeMeta(meta) {
        if (!meta || typeof meta !== "object") return null;
        try {
            return JSON.parse(JSON.stringify(meta));
        } catch (e) {
            console.warn("Failed to serialize notification metadata:", e);
            return null;
        }
    },

    getCurrentMonthKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return `${year}-${month}`;
    },

    normalizeCategoryKey(category) {
        return String(category || "general")
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "") || "general";
    },

    getBudgetThresholdStateKey(uid, categoryKey, monthKey) {
        return `${BUDGET_THRESHOLD_STATE_PREFIX}${uid || "guest"}_${categoryKey}_${monthKey}`;
    },

    getBudgetThresholdState(uid, categoryKey, monthKey) {
        const stored = Number(localStorage.getItem(this.getBudgetThresholdStateKey(uid, categoryKey, monthKey)) || "0");
        return Number.isFinite(stored) ? stored : 0;
    },

    setBudgetThresholdState(uid, categoryKey, monthKey, thresholdPct) {
        localStorage.setItem(
            this.getBudgetThresholdStateKey(uid, categoryKey, monthKey),
            String(Number.isFinite(thresholdPct) ? thresholdPct : 0)
        );
    },

    getStoredInAppNotifications() {
        try {
            const raw = JSON.parse(localStorage.getItem("smartwallet_notifications") || "[]");
            return Array.isArray(raw) ? raw : [];
        } catch (e) {
            return [];
        }
    },

    hasStoredInAppNotification(type, meta = null) {
        const items = this.getStoredInAppNotifications();
        return items.some((item) => {
            if (item?.type === type) return true;
            if (!meta || !item?.meta) return false;
            return (
                item.meta.category === meta.category
                && String(item.meta.monthKey || "") === String(meta.monthKey || "")
                && Number(item.meta.thresholdPct || 0) === Number(meta.thresholdPct || 0)
            );
        });
    },

    async deliverLocalNotification(uid, fallbackId, title, body, type = "general", createdAtMs = Date.now(), meta = null) {
        const plugin = this.getLocalNotificationsPlugin();
        if (!plugin) return false;
        if (this.wasDeliveredLocally(uid, type, fallbackId)) return true;

        const allowed = await this.ensureLocalPermissions();
        if (!allowed) return false;

        try {
            await plugin.schedule({
                notifications: [
                    {
                        title,
                        body,
                        id: this.createNativeNotificationId(`${uid}:${type}:${fallbackId}`),
                        schedule: { at: new Date(Date.now() + 450) },
                        extra: { notifId: fallbackId, type, uid, meta: this.sanitizeMeta(meta) }
                    }
                ]
            });
            this.markDeliveredLocally(uid, type, fallbackId, createdAtMs);
            return true;
        } catch (e) {
            console.warn("LocalNotification failed:", e);
            return false;
        }
    },

    /**
     * Centralized trigger for both Firestore and local notifications.
     */
    async triggerNotification(uid, title, body, type = "general", meta = null) {
        if (!uid) return;

        let notifId = `local-${Date.now()}`;
        const createdAtMs = Date.now();
        const safeMeta = this.sanitizeMeta(meta);
        let mirrored = false;
        const mirrorInApp = () => {
            if (mirrored || !window.createNotification) return;
            mirrored = true;
            if (!window.createNotification) return;
            try {
                window.createNotification(title, body, type, null, safeMeta);
            } catch (fallbackErr) {
                console.warn("In-app notification mirror failed:", fallbackErr);
            }
        };

        // Make notifications visible immediately instead of waiting on Firestore latency.
        mirrorInApp();
        await this.deliverLocalNotification(uid, notifId, title, body, type, createdAtMs, safeMeta);

        try {
            const userNotifsRef = collection(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`);
            const payload = {
                title,
                body,
                type,
                isRead: false,
                createdAt: serverTimestamp()
            };
            if (safeMeta) payload.meta = safeMeta;
            const notifDoc = await addDoc(userNotifsRef, payload);
            notifId = notifDoc.id;
            await this.deliverLocalNotification(uid, notifId, title, body, type, createdAtMs, safeMeta);
            console.log(`Notification triggered: ${title}`);
            return notifDoc.id;
        } catch (e) {
            console.error("Error triggering notification:", e);
            await this.deliverLocalNotification(uid, notifId, title, body, type, createdAtMs, safeMeta);
            return notifId;
        }
    },

    async replayMissedNotifications(uid, replayLimit = 25) {
        if (!uid) return;

        try {
            const syncKey = `${LOCAL_NOTIF_LAST_SYNC_PREFIX}${uid}`;
            const lastSync = Number(localStorage.getItem(syncKey) || "0");
            const q = query(
                collection(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`),
                orderBy("createdAt", "desc"),
                limit(replayLimit)
            );
            const snap = await getDocs(q);
            const pending = [];
            let newestSeen = lastSync;

            snap.forEach((docSnap) => {
                const data = docSnap.data() || {};
                const createdAtMs = this.getCreatedAtMillis(data);
                if (!createdAtMs) return;
                newestSeen = Math.max(newestSeen, createdAtMs);
                if (lastSync && createdAtMs <= lastSync) return;
                if (this.wasDeliveredLocally(uid, data.type, docSnap.id)) return;
                pending.push({
                    id: docSnap.id,
                    title: data.title,
                    body: data.body,
                    type: data.type || "general",
                    createdAtMs,
                    meta: data.meta || null
                });
            });

            pending.sort((a, b) => a.createdAtMs - b.createdAtMs);
            for (const notif of pending) {
                await this.deliverLocalNotification(uid, notif.id, notif.title, notif.body, notif.type, notif.createdAtMs, notif.meta);
            }

            if (newestSeen > lastSync) {
                localStorage.setItem(syncKey, String(newestSeen));
            }
        } catch (e) {
            console.warn("Failed to replay missed notifications:", e);
        }
    },

    async handleRealtimeSnapshot(uid, snapshot) {
        if (!uid || !snapshot?.docChanges) return;

        try {
            for (const change of snapshot.docChanges()) {
                if (change.type !== "added") continue;
                const data = change.doc.data() || {};
                const createdAtMs = this.getCreatedAtMillis(data) || Date.now();
                await this.deliverLocalNotification(
                    uid,
                    change.doc.id,
                    data.title,
                    data.body,
                    data.type || "general",
                    createdAtMs,
                    data.meta || null
                );
            }
        } catch (e) {
            console.warn("Realtime local notification bridge failed:", e);
        }
    },

    async checkBudgetThresholds(uid, category, current, limitAmount) {
        if (!uid || !Number.isFinite(current) || !Number.isFinite(limitAmount) || limitAmount <= 0) return;
        const pct = (current / limitAmount) * 100;
        const monthKey = this.getCurrentMonthKey();
        const categoryKey = this.normalizeCategoryKey(category);
        const lastThreshold = this.getBudgetThresholdState(uid, categoryKey, monthKey);

        const tiers = [
            { pct: 100, label: "Limit Reached", body: `Red Alert: You've hit 100% of your ${category} budget!` },
            { pct: 90, label: "Orange Alert", body: `Critical Level: Only P${Math.floor(limitAmount - current).toLocaleString()} left for ${category}.` },
            { pct: 70, label: "Heads up", body: `Heads up: You've used 70% of your ${category} budget.` }
        ];

        const eligibleTiers = tiers
            .filter((tier) => pct >= tier.pct)
            .sort((a, b) => b.pct - a.pct);

        if (!eligibleTiers.length) return;

        let highestMissingTier = null;
        for (const tier of eligibleTiers) {
            const notifType = `threshold_${categoryKey}_${tier.pct}_${monthKey}`;
            const alreadyNotified = await this.hasNotified(uid, notifType);
            if (!alreadyNotified) {
                highestMissingTier = tier;
                break;
            }
        }

        if (highestMissingTier) {
            const notifType = `threshold_${categoryKey}_${highestMissingTier.pct}_${monthKey}`;
            await this.triggerNotification(
                uid,
                highestMissingTier.label,
                highestMissingTier.body,
                notifType,
                {
                    action: "open_budget_overview",
                    category: categoryKey,
                    thresholdPct: highestMissingTier.pct,
                    monthKey
                }
            );
        } else {
            const currentTier = eligibleTiers[0];
            const notifType = `threshold_${categoryKey}_${currentTier.pct}_${monthKey}`;
            const meta = {
                action: "open_budget_overview",
                category: categoryKey,
                thresholdPct: currentTier.pct,
                monthKey
            };

            if (!this.hasStoredInAppNotification(notifType, meta) && window.createNotification) {
                try {
                    window.createNotification(currentTier.label, currentTier.body, notifType, null, meta);
                } catch (fallbackErr) {
                    console.warn("Budget threshold in-app recovery failed:", fallbackErr);
                }
            }

            if (!this.wasDeliveredLocally(uid, notifType, notifType)) {
                const delivered = await this.deliverLocalNotification(
                    uid,
                    notifType,
                    currentTier.label,
                    currentTier.body,
                    notifType,
                    Date.now(),
                    meta
                );
                if (!delivered) {
                    this.markDeliveredLocally(uid, notifType, notifType, Date.now());
                }
            }
        }

        const highestEligiblePct = eligibleTiers[0]?.pct || lastThreshold;
        this.setBudgetThresholdState(uid, categoryKey, monthKey, Math.max(lastThreshold, highestEligiblePct));
    },

    async checkVelocity(uid, category, dailyTotal, monthlyLimit) {
        if (monthlyLimit <= 0) return;
        const velocityPct = (dailyTotal / monthlyLimit) * 100;

        if (velocityPct >= 20) {
            const alreadyNotified = await this.hasNotifiedToday(uid, `velocity_${category}`);
            if (!alreadyNotified) {
                await this.triggerNotification(
                    uid,
                    "High Velocity",
                    `You've used ${Math.round(velocityPct)}% of your '${category}' budget in one day. Take a 48-hour breather?`,
                    `velocity_${category}`
                );
            }
        }
    },

    async checkRecurringReminders(uid) {
        const today = new Date();
        const dd = today.getDate();

        const isMonthEnd = (dt) => {
            const nextDay = new Date(dt.getTime() + 86400000);
            return nextDay.getDate() === 1;
        };

        if (dd === 15 || isMonthEnd(today)) {
            const alreadyNotified = await this.hasNotifiedToday(uid, `recurring_tuition_${dd}`);
            if (!alreadyNotified) {
                await this.triggerNotification(
                    uid,
                    "Tuition Reminder",
                    "Friendly reminder: Tuition is due today/tomorrow. Ensure funds are ready!",
                    `recurring_tuition_${dd}`
                );
            }
        }
    },

    async checkGoalMilestones(uid, goalId, title, current, target) {
        if (target <= 0) return;
        const pct = (current / target) * 100;

        const milestones = [
            { pct: 100, label: "Goal Reached!", body: `Congratulations! You've reached your P${target.toLocaleString()} goal for '${title}'!` },
            { pct: 75, label: "Almost There!", body: `You are 75% focused on '${title}'! Only a bit more to go.` },
            { pct: 50, label: "Halfway Point", body: `Boom! You're 50% done with '${title}'. Keep that momentum!` },
            { pct: 0, threshold: 1000, label: "Milestone Achieved", body: `First P1,000 saved for '${title}'! This is just the beginning.` }
        ];

        for (const meta of milestones) {
            let hit = false;
            if (meta.threshold) hit = current >= meta.threshold && (current - meta.threshold) < 1000;
            else hit = pct >= meta.pct;

            if (hit) {
                const key = `goal_${goalId}_${meta.pct || meta.threshold}`;
                const alreadyNotified = await this.hasNotified(uid, key);
                if (!alreadyNotified) {
                    await this.triggerNotification(uid, meta.label, meta.body, key);
                }
                break;
            }
        }
    },

    async checkMonthlyComparison(uid) {
        const today = new Date();
        if (today.getDate() !== 1) return;

        const alreadyNotified = await this.hasNotifiedToday(uid, "monthly_comparison");
        if (alreadyNotified) return;

        try {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const monthName = lastMonth.toLocaleString("default", { month: "long" });

            await this.triggerNotification(
                uid,
                `${monthName} Summary`,
                `New month, new goals! Check your ${monthName} report to see if you beat your 'Best Month' record.`,
                "monthly_comparison"
            );
        } catch (e) {
            console.error("Monthly check failed", e);
        }
    },

    async hasNotifiedToday(uid, type) {
        try {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const q = query(
                collection(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`),
                where("type", "==", type),
                where("createdAt", ">=", startOfDay),
                limit(1)
            );
            const snap = await getDocs(q);
            return !snap.empty;
        } catch (e) {
            return false;
        }
    },

    async hasNotified(uid, type) {
        try {
            const q = query(
                collection(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`),
                where("type", "==", type),
                limit(1)
            );
            const snap = await getDocs(q);
            return !snap.empty;
        } catch (e) {
            return false;
        }
    }
};
