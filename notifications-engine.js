/**
 * Smart Wallet - Notifications Engine
 * Handles persistent notifications via Firestore and local mobile alerts.
 */

import {
    db,
    doc,
    getDoc,
    setDoc,
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    limit,
    getDocs,
    where
} from "./firebase-config.js";
import { repairTextArtifacts, repairNotificationTextArtifacts } from "./app-utils.js";

const NOTIFICATIONS_COLLECTION = "notifications";
const LOCAL_NOTIF_CACHE_KEY = "smartwallet_local_notif_cache_v1";
const LOCAL_NOTIF_LAST_SYNC_PREFIX = "smartwallet_local_notif_last_sync_";
const BUDGET_THRESHOLD_STATE_PREFIX = "smartwallet_budget_threshold_state_";
const LOCAL_NOTIF_INSTALL_EPOCH_PREFIX = "smartwallet_notif_install_epoch_";

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

    getStableNotificationKey(type = "general", meta = null, fallbackId = "") {
        const safeMeta = this.sanitizeMeta(meta);
        const explicitKey = safeMeta?.notificationKey || safeMeta?.dedupeKey || safeMeta?.remoteKey || "";
        if (explicitKey) return String(explicitKey);

        const persistentDocId = this.getPersistentNotificationDocId(type, safeMeta);
        if (persistentDocId) return persistentDocId;

        if (fallbackId) return String(fallbackId);
        if (type) return String(type);
        return "general";
    },

    getLocalNotifKey(uid, type, fallbackId = "", meta = null) {
        return `${uid || "guest"}:${this.getStableNotificationKey(type, meta, fallbackId)}`;
    },

    wasDeliveredLocally(uid, type, fallbackId = "", meta = null) {
        const cache = this.getLocalCache();
        return Boolean(cache[this.getLocalNotifKey(uid, type, fallbackId, meta)]);
    },

    markDeliveredLocally(uid, type, fallbackId = "", createdAtMs = Date.now(), meta = null) {
        const cache = this.getLocalCache();
        cache[this.getLocalNotifKey(uid, type, fallbackId, meta)] = createdAtMs;
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
        const createdAtMs = Number(data?.createdAtMs || 0);
        if (Number.isFinite(createdAtMs) && createdAtMs > 0) return createdAtMs;
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

    getNotificationInstallEpoch(uid, initializeIfMissing = true) {
        const key = `${LOCAL_NOTIF_INSTALL_EPOCH_PREFIX}${uid || "guest"}`;
        const existing = Number(localStorage.getItem(key) || "0");
        if (Number.isFinite(existing) && existing > 0) return existing;
        if (!initializeIfMissing) return 0;
        const now = Date.now();
        localStorage.setItem(key, String(now));
        return now;
    },

    isNotificationVisibleForCurrentInstall(uid, createdAtMs) {
        const installEpoch = this.getNotificationInstallEpoch(uid, true);
        if (!installEpoch) return true;
        return Number(createdAtMs || 0) >= installEpoch;
    },

    setBudgetThresholdState(uid, categoryKey, monthKey, thresholdPct) {
        localStorage.setItem(
            this.getBudgetThresholdStateKey(uid, categoryKey, monthKey),
            String(Number.isFinite(thresholdPct) ? thresholdPct : 0)
        );
    },

    getBudgetThresholdTier(category, current, limitAmount) {
        if (!Number.isFinite(current) || !Number.isFinite(limitAmount) || limitAmount <= 0) return null;
        const pct = (current / limitAmount) * 100;
        const categoryLabel = String(category || 'Budget');
        const tiers = [
            {
                pct: 100,
                title: "Limit Reached",
                body: `Red Alert: You've hit 100% of your ${categoryLabel} budget!`
            },
            {
                pct: 90,
                title: "Orange Alert",
                body: `Critical Level: Only P${Math.floor(limitAmount - current).toLocaleString()} left for ${categoryLabel}.`
            },
            {
                pct: 70,
                title: "Heads up",
                body: `Heads up: You've used 70% of your ${categoryLabel} budget.`
            }
        ];
        return tiers.find((tier) => pct >= tier.pct) || null;
    },

    ensureBudgetThresholdInApp(uid, category, current, limitAmount) {
        const tier = this.getBudgetThresholdTier(category, current, limitAmount);
        if (!tier) return false;

        const monthKey = this.getCurrentMonthKey();
        const categoryKey = this.normalizeCategoryKey(category);
        const notifType = `threshold_${categoryKey}_${tier.pct}_${monthKey}`;
        const meta = {
            action: "open_budget_overview",
            category: categoryKey,
            thresholdPct: tier.pct,
            monthKey
        };

        const hasLocal = this.hasStoredInAppNotification(notifType, meta);
        if (!hasLocal) {
            this.ensureStoredInAppNotification(tier.title, tier.body, notifType, meta);
        }

        const existing = this.getBudgetThresholdState(uid, categoryKey, monthKey);
        this.setBudgetThresholdState(uid, categoryKey, monthKey, Math.max(existing, tier.pct));
        return !hasLocal;
    },

    getStoredInAppNotifications() {
        try {
            const raw = JSON.parse(localStorage.getItem("smartwallet_notifications") || "[]");
            const items = Array.isArray(raw) ? raw : [];
            const deduped = this.dedupeStoredInAppNotifications(items);
            if (deduped.length !== items.length) {
                this.writeStoredInAppNotifications(deduped);
            }
            return deduped;
        } catch (e) {
            return [];
        }
    },

    writeStoredInAppNotifications(items) {
        try {
            localStorage.setItem("smartwallet_notifications", JSON.stringify(this.dedupeStoredInAppNotifications(Array.isArray(items) ? items : [])));
        } catch (e) {
            console.warn("Failed to persist in-app notifications:", e);
        }
    },

    getStoredNotificationIdentity(item = {}) {
        try {
            const safeMeta = this.sanitizeMeta(item?.meta || null);
            const type = String(item?.type || "general");
            const title = repairTextArtifacts(String(item?.title || ""));
            const body = repairTextArtifacts(String(item?.body || item?.message || ""));
            const createdAtMs = Number(item?.createdAtMs || new Date(item?.time || Date.now()).getTime() || Date.now());
            const createdAt = createdAtMs > 0 ? new Date(createdAtMs) : null;
            const createdMonthKey = createdAt && !Number.isNaN(createdAt.getTime())
                ? createdAt.toISOString().slice(0, 7)
                : "";

            if (type === "monthly_comparison" && safeMeta?.monthKey) {
                return `monthly:${safeMeta.monthKey}`;
            }

            if (type === "daily_summary" && safeMeta?.dayKey) {
                return `daily:${safeMeta.dayKey}`;
            }

            if (/^daily summary$/i.test(title)) {
                const dayKey = new Date(createdAtMs).toISOString().slice(0, 10);
                return `daily:${dayKey}`;
            }

            if (
                /^tuition reminder$/i.test(title)
                || (/friendly reminder/i.test(body) && /tuition/i.test(body))
                || /tuition'?s due today\/tomorrow/i.test(body)
            ) {
                const monthKey = String(safeMeta?.monthKey || safeMeta?.dueMonthKey || createdMonthKey || "");
                if (monthKey) return `tuition:${monthKey}`;
                return "tuition:general";
            }

            if (/summary$/i.test(title)) {
                return `summary:${title.toLowerCase()}`;
            }

            return this.getStableNotificationKey(type, safeMeta, `${type}|${title}|${body}`);
        } catch (error) {
            console.warn("Stored notification identity generation failed:", error);
            return this.getStableNotificationKey(
                String(item?.type || "general"),
                item?.meta || null,
                String(item?.id || item?.createdAtMs || Date.now())
            );
        }
    },

    dedupeStoredInAppNotifications(items = []) {
        const seen = new Set();
        const deduped = [];

        for (const item of items || []) {
            const key = this.getStoredNotificationIdentity(item);
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
        }

        return deduped;
    },

    sanitizeNotificationDocToken(value, fallback = "general") {
        const normalized = String(value || fallback)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "");
        return normalized || fallback;
    },

    getStoredNotificationDocId(item = {}) {
        if (item?.remoteId) return String(item.remoteId);
        const persistentDocId = this.getPersistentNotificationDocId(item?.type || "general", item?.meta || null);
        if (persistentDocId) return persistentDocId;
        const typeKey = this.sanitizeNotificationDocToken(item?.type || "general");
        const timeMs = Number(item?.createdAtMs || new Date(item?.time || Date.now()).getTime() || Date.now());
        const localId = this.sanitizeNotificationDocToken(item?.id || "local");
        return `notif_${typeKey}_${timeMs}_${localId}`.slice(0, 140);
    },

    getPersistentNotificationDocId(type = "general", meta = null) {
        const safeMeta = this.sanitizeMeta(meta);
        const typeText = String(type || "general");

        if (typeText === "monthly_comparison" && safeMeta?.monthKey) {
            return `notif_monthly_${this.sanitizeNotificationDocToken(safeMeta.monthKey)}`.slice(0, 140);
        }

        if (typeText === "daily_summary" && safeMeta?.dayKey) {
            return `notif_daily_${this.sanitizeNotificationDocToken(safeMeta.dayKey)}`.slice(0, 140);
        }

        // Goal milestones: single stable id per type + cycle (ignore notificationKey so backfill and
        // checkGoalMilestones never split across notif_persist_* vs notif_goal_*).
        if (/^goal_[a-z0-9_-]+_(50|75|100|1000)$/i.test(typeText)) {
            const cycle = Number(safeMeta?.cycle || 0);
            const base = cycle > 0 ? `${typeText}_cycle_${cycle}` : typeText;
            const typeKey = this.sanitizeNotificationDocToken(base);
            return `notif_goal_${typeKey}`.slice(0, 140);
        }

        const explicitKey = safeMeta?.notificationKey || safeMeta?.dedupeKey || safeMeta?.remoteKey || null;
        const typeKey = this.sanitizeNotificationDocToken(explicitKey || typeText);

        if (explicitKey) return `notif_persist_${typeKey}`.slice(0, 140);
        if (/^threshold_[a-z0-9_]+_(70|90|100)_(\d{4}-\d{2})$/i.test(typeText)) {
            return `notif_threshold_${typeKey}`.slice(0, 140);
        }
        return null;
    },

    normalizeStoredNotificationPayload(item = {}) {
        const createdAtMs = Number(item?.createdAtMs || new Date(item?.time || Date.now()).getTime() || Date.now());
        const isRead = typeof item?.isRead === "boolean"
            ? item.isRead
            : !Boolean(item?.unread);
        const safeMeta = this.sanitizeMeta(item?.meta || null);
        const safeAction = this.sanitizeMeta(item?.action || null);
        const payload = {
            title: repairTextArtifacts(item?.title || "Notification"),
            body: repairTextArtifacts(item?.body || item?.message || ""),
            type: item?.type || "general",
            isRead,
            createdAt: new Date(createdAtMs),
            createdAtMs
        };
        if (safeMeta) payload.meta = safeMeta;
        if (safeAction) payload.action = safeAction;
        return payload;
    },

    markStoredNotificationRemoteState(matchItem = {}, remoteId = null) {
        try {
            const items = this.getStoredInAppNotifications();
            const matchMeta = JSON.stringify(this.sanitizeMeta(matchItem?.meta || null));
            let changed = false;
            const updated = items.map((item) => {
                const itemMeta = JSON.stringify(this.sanitizeMeta(item?.meta || null));
                const sameBody = String(item?.body || item?.message || "") === String(matchItem?.body || matchItem?.message || "");
                const sameTitle = String(item?.title || "") === String(matchItem?.title || "");
                const sameType = String(item?.type || "general") === String(matchItem?.type || "general");
                const sameTime = Number(item?.createdAtMs || new Date(item?.time || 0).getTime() || 0) === Number(matchItem?.createdAtMs || new Date(matchItem?.time || 0).getTime() || 0);
                if (!changed && sameTitle && sameBody && sameType && itemMeta === matchMeta && sameTime) {
                    changed = true;
                    return {
                        ...item,
                        remoteId: remoteId || item.remoteId || this.getStoredNotificationDocId(item),
                        remoteSynced: true
                    };
                }
                return item;
            });
            if (changed) this.writeStoredInAppNotifications(updated);
        } catch (e) {
            console.warn("Failed to update stored notification remote state:", e);
        }
    },

    async syncStoredNotificationToFirestore(uid, item = {}) {
        if (!uid || !item) return null;
        const docId = this.getStoredNotificationDocId(item);
        const payload = this.normalizeStoredNotificationPayload(item);
        try {
            await setDoc(doc(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`, docId), {
                ...payload,
                syncedFromLocal: true,
                syncedAt: serverTimestamp()
            }, { merge: true });
            this.markStoredNotificationRemoteState(item, docId);
            return docId;
        } catch (e) {
            console.warn("Failed to sync stored notification to Firestore:", e);
            return null;
        }
    },

    async syncStoredInAppNotifications(uid, maxItems = 200) {
        if (!uid) return;
        const items = this.getStoredInAppNotifications()
            .slice(0, maxItems)
            .filter((item) => !item?.remoteSynced);
        for (const item of items) {
            await this.syncStoredNotificationToFirestore(uid, item);
        }
    },

    sameThresholdMeta(left = null, right = null) {
        if (!left || !right) return false;
        const sameCategory = String(left.category || "") === String(right.category || "");
        const sameMonth = String(left.monthKey || "") === String(right.monthKey || "");
        const sameThreshold = Number(left.thresholdPct || 0) === Number(right.thresholdPct || 0);
        if (!sameCategory || !sameMonth || !sameThreshold) return false;

        const leftCycle = Number(left.cycle || 0);
        const rightCycle = Number(right.cycle || 0);
        if (leftCycle > 0 || rightCycle > 0) {
            return leftCycle === rightCycle;
        }
        return true;
    },

    hasStoredInAppNotification(type, meta = null) {
        const items = this.getStoredInAppNotifications();
        const targetMeta = this.sanitizeMeta(meta);
        return items.some((item) => {
            if ((item?.type || "general") !== type) return false;
            if (!targetMeta) return true;
            const itemMeta = this.sanitizeMeta(item?.meta || null);
            if (!itemMeta) return false;
            if (this.sameThresholdMeta(itemMeta, targetMeta)) return true;
            return this.getStableNotificationKey(type, itemMeta, "") === this.getStableNotificationKey(type, targetMeta, "");
        });
    },

    ensureStoredInAppNotification(title, message, type = "general", meta = null) {
        try {
            const safeTitle = repairTextArtifacts(title || "Notification");
            const safeMessage = repairNotificationTextArtifacts(message || "", safeTitle);
            const items = this.getStoredInAppNotifications();
            const hasExact = items.some((item) => {
                if ((item?.type || "general") !== type) return false;
                const itemMeta = item?.meta || null;
                if (meta && itemMeta) {
                    return this.sameThresholdMeta(itemMeta, meta);
                }
                return (item?.title || "") === safeTitle && (item?.message || "") === safeMessage;
            });
            if (hasExact) return false;

            const newNotif = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                title: safeTitle,
                message: safeMessage,
                type,
                time: new Date().toISOString(),
                createdAtMs: Date.now(),
                unread: true,
                action: null,
                meta: meta && typeof meta === "object" ? JSON.parse(JSON.stringify(meta)) : null,
                remoteId: null,
                remoteSynced: false
            };

            items.unshift(newNotif);
            this.writeStoredInAppNotifications(items);

            if (typeof window.updateUnreadCount === "function") {
                try {
                    window.updateUnreadCount();
                } catch (e) {
                    console.warn("Immediate unread update failed:", e);
                }
            }

            window.dispatchEvent(new CustomEvent("notification-created", { detail: newNotif }));

            const syncUid = window.auth?.currentUser?.isAnonymous ? null : window.auth?.currentUser?.uid;
            if (syncUid) {
                this.syncStoredNotificationToFirestore(syncUid, newNotif).catch((e) => {
                    console.warn("Immediate stored notification sync failed:", e);
                });
            }
            return true;
        } catch (e) {
            console.warn("Failed to store in-app notification:", e);
            return false;
        }
    },

    async deliverLocalNotification(uid, fallbackId, title, body, type = "general", createdAtMs = Date.now(), meta = null) {
        const plugin = this.getLocalNotificationsPlugin();
        if (!plugin) return false;
        if (this.wasDeliveredLocally(uid, type, fallbackId, meta)) return true;

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
                        smallIcon: "ic_stat_wallet",
                        iconColor: "#111827",
                        extra: { notifId: fallbackId, type, uid, meta: this.sanitizeMeta(meta) }
                    }
                ]
            });
            this.markDeliveredLocally(uid, type, fallbackId, createdAtMs, meta);
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
        const safeTitle = repairTextArtifacts(title || "Notification");
        const safeBody = repairNotificationTextArtifacts(body || "", safeTitle);

        let notifId = `local-${Date.now()}`;
        const createdAtMs = Date.now();
        const safeMeta = this.sanitizeMeta(meta);
        const persistentDocId = this.getPersistentNotificationDocId(type, safeMeta);

        if (persistentDocId) {
            try {
                const existingDoc = await getDoc(doc(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`, persistentDocId));
                if (existingDoc.exists()) {
                    return persistentDocId;
                }
            } catch (e) {
                console.warn("Persistent notification lookup failed:", e);
            }
        }

        // [FIX: 2026-04-10] Removed redundant immediate local delivery call to prevent duplicate alerts - Antigravity
        this.ensureStoredInAppNotification(safeTitle, safeBody, type, safeMeta);
        // await this.deliverLocalNotification(uid, notifId, title, body, type, createdAtMs, safeMeta);

        try {
            const payload = {
                title: safeTitle,
                body: safeBody,
                type,
                isRead: false,
                createdAt: new Date(createdAtMs),
                createdAtMs
            };
            if (safeMeta) payload.meta = safeMeta;

            if (persistentDocId) {
                await setDoc(doc(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`, persistentDocId), payload, { merge: true });
                notifId = persistentDocId;
            } else {
                const userNotifsRef = collection(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`);
                const notifDoc = await addDoc(userNotifsRef, payload);
                notifId = notifDoc.id;
            }

            this.markStoredNotificationRemoteState({
                title: safeTitle,
                body: safeBody,
                type,
                meta: safeMeta,
                createdAtMs
            }, notifId);
            await this.deliverLocalNotification(uid, notifId, safeTitle, safeBody, type, createdAtMs, safeMeta);
            console.log(`Notification triggered: ${safeTitle}`);
            return notifId;
        } catch (e) {
            console.error("Error triggering notification:", e);
            await this.deliverLocalNotification(uid, notifId, safeTitle, safeBody, type, createdAtMs, safeMeta);
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
                if (!this.isNotificationVisibleForCurrentInstall(uid, createdAtMs)) return;
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
                if (!this.isNotificationVisibleForCurrentInstall(uid, createdAtMs)) continue;
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

    async backfillNotificationsFromState(uid) {
        if (!uid) return;

        try {
            const progressSnap = await getDoc(doc(db, `users/${uid}/config/budget_progress_tracker`));
            if (progressSnap.exists()) {
                const data = progressSnap.data() || {};
                const currentMonthKey = this.getCurrentMonthKey();
                const monthKey = String(data.monthKey || currentMonthKey);
                const filterVal = String(data.filterVal || "this_month");
                if (filterVal === "this_month" && monthKey === currentMonthKey) {
                    const liveSnapshot = window.lastBudgetNotificationSnapshot;
                    const snapshotMatchesCurrentMonth = Boolean(
                        liveSnapshot
                        && liveSnapshot.liveReady
                        && liveSnapshot.filterVal === "this_month"
                        && String(liveSnapshot.monthKey || "") === currentMonthKey
                    );
                    const categories = [
                        { key: "needs", label: "Needs", pct: Number(data["needs-pct"] || 0) },
                        { key: "wants", label: "Wants", pct: Number(data["wants-pct"] || 0) },
                        { key: "savings", label: "Savings", pct: Number(data["savings-pct"] || 0) }
                    ];

                    for (const item of categories) {
                        const thresholdPct = item.pct >= 100 ? 100 : item.pct >= 90 ? 90 : item.pct >= 70 ? 70 : 0;
                        if (!thresholdPct) continue;
                        const localState = this.getBudgetThresholdState(uid, item.key, monthKey);
                        if (!snapshotMatchesCurrentMonth) {
                            if (localState > 0) {
                                this.setBudgetThresholdState(uid, item.key, monthKey, 0);
                            }
                            continue;
                        }

                        const livePctMap = {
                            needs: Number(liveSnapshot.needsPct || 0),
                            wants: Number(liveSnapshot.wantsPct || 0),
                            savings: Number(liveSnapshot.savingsPct || 0)
                        };
                        const livePct = Number(livePctMap[item.key] || 0);
                        if (!Number.isFinite(livePct) || livePct < thresholdPct) {
                            if (localState > 0 && livePct < 70) {
                                this.setBudgetThresholdState(uid, item.key, monthKey, 0);
                            }
                            continue;
                        }

                        this.setBudgetThresholdState(uid, item.key, monthKey, Math.max(localState, thresholdPct));
                    }
                }
            }
        } catch (e) {
            console.warn("Budget notification backfill failed:", e);
        }

        try {
            const goalsSnap = await getDocs(collection(db, `users/${uid}/goals`));
            for (const goalDoc of goalsSnap.docs) {
                const goal = goalDoc.data() || {};
                const goalId = goalDoc.id;
                const targetAmount = Number(goal.targetAmount || 0);
                const currentAmount = Number(goal.currentAmount || 0);
                if (!(targetAmount > 0)) continue;

                const pct = (currentAmount / targetAmount) * 100;
                const cycles = (goal.milestoneCycles && typeof goal.milestoneCycles === "object") ? goal.milestoneCycles : {};
                const completedCycle = Number(cycles["100"] || 0);
                const halfwayCycle = Number(cycles["50"] || 0);

                if (pct >= 100 && completedCycle > 0) {
                    const type = `goal_${goalId}_100`;
                    const meta = {
                        action: "open_goal_edit",
                        goalId,
                        source: "goals",
                        milestone: "100",
                        cycle: completedCycle,
                        notificationKey: type
                    };
                    const alreadyNotified = await this.hasNotified(uid, type, meta);
                    
                    // [FIX: 2026-04-10] Check Goal Notif Tracker to prevent spamming on clear history - Antigravity
                    const goalTrackKey = `goal_notif_${goalId}_${completedCycle}`;
                    if (localStorage.getItem(goalTrackKey) || alreadyNotified) {
                        if (!localStorage.getItem(goalTrackKey)) localStorage.setItem(goalTrackKey, "1");
                        continue;
                    }

                    const title = "Goal Completed! 🏆";
                    const body = `Congratulations! You've reached your ₱${targetAmount.toLocaleString()} goal for ${goal.title}.`;
                    this.ensureStoredInAppNotification(title, body, type, meta);
                    // [FIX: 2026-04-10] Use centralized triggerNotification for goal milestones to ensure stable deduplication - Antigravity
                    await this.triggerNotification(uid, title, body, type, meta);
                    // Mark as locally triggered
                    localStorage.setItem(goalTrackKey, "1");
                }

                if (pct >= 50 && halfwayCycle > 0) {
                    const type = `goal_${goalId}_50`;
                    const meta = {
                        action: "open_goal_edit",
                        goalId,
                        source: "goals",
                        milestone: "50",
                        cycle: halfwayCycle,
                        notificationKey: type
                    };
                    const alreadyNotified = await this.hasNotified(uid, type, meta);

                    // [FIX: 2026-04-10] Goal 50% Milestone persistent deduplication - Antigravity
                    const goalTrackKeyHalf = `goal_notif_${goalId}_half_${halfwayCycle}`;
                    if (localStorage.getItem(goalTrackKeyHalf) || alreadyNotified) {
                        if (!localStorage.getItem(goalTrackKeyHalf)) localStorage.setItem(goalTrackKeyHalf, "1");
                        continue;
                    }

                    const title = "Halfway There!";
                    const body = `You're 50% through your goal for ${goal.title}. Keep it up!`;
                    this.ensureStoredInAppNotification(title, body, type, meta);
                    // [FIX: 2026-04-10] Use centralized triggerNotification for 50% milestone to ensure stable local delivery - Antigravity
                    await this.triggerNotification(uid, title, body, type, meta);
                    // Mark as locally triggered
                    localStorage.setItem(goalTrackKeyHalf, "1");
                }
            }
        } catch (e) {
            console.warn("Goal notification backfill failed:", e);
        }
    },

    async checkBudgetThresholds(uid, category, current, limitAmount) {
        if (!uid || !Number.isFinite(current) || !Number.isFinite(limitAmount) || limitAmount <= 0) return;
        this.ensureBudgetThresholdInApp(uid, category, current, limitAmount);
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
        const hasHundredTier = eligibleTiers.some(tier => tier.pct === 100);
        if (hasHundredTier) {
            const hundredType = `threshold_${categoryKey}_100_${monthKey}`;
            const hundredMeta = {
                action: "open_budget_overview",
                category: categoryKey,
                thresholdPct: 100,
                monthKey
            };
            const hundredAlready = this.hasStoredInAppNotification(hundredType, hundredMeta)
                || await this.hasNotified(uid, hundredType, hundredMeta);
            if (hundredAlready) {
                // Once 100% is reached/notified, skip lower-tier notifications for same month cycle.
                this.setBudgetThresholdState(uid, categoryKey, monthKey, Math.max(lastThreshold, 100));
                return;
            }
        }

        for (const tier of eligibleTiers) {
            const notifType = `threshold_${categoryKey}_${tier.pct}_${monthKey}`;
            const meta = {
                action: "open_budget_overview",
                category: categoryKey,
                thresholdPct: tier.pct,
                monthKey
            };
            const alreadyStored = this.hasStoredInAppNotification(notifType, meta);
            const alreadyNotified = alreadyStored || await this.hasNotified(uid, notifType, meta);
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

            if (!this.hasStoredInAppNotification(notifType, meta)) {
                this.ensureStoredInAppNotification(currentTier.label, currentTier.body, notifType, meta);
            }

            if (!this.wasDeliveredLocally(uid, notifType, notifType, meta)) {
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
                    this.markDeliveredLocally(uid, notifType, notifType, Date.now(), meta);
                }
            }
        }

        const highestEligiblePct = eligibleTiers[0]?.pct || lastThreshold;
        this.setBudgetThresholdState(uid, categoryKey, monthKey, Math.max(lastThreshold, highestEligiblePct));
    },

    async checkVelocity(uid, category, dailyTotal, monthlyLimit) {
        // Disabled: daily-style velocity alerts were noisy for users.
        return;
    },

    async checkRecurringReminders(uid) {
        // Disabled per product requirement: no daily/recurring reminders.
        return;
    },

    async checkGoalMilestones(uid, goalId, title, current, target, milestoneCycles = null) {
        if (target <= 0) return;
        const pct = (current / target) * 100;
        const cycles = (milestoneCycles && typeof milestoneCycles === "object") ? milestoneCycles : {};

        const milestones = [
            {
                pct: 100,
                cycleKey: "100",
                label: "Goal Completed! 🏆",
                body: `Congratulations! You've reached your ₱${target.toLocaleString()} goal for ${title}.`
            },
            {
                pct: 75,
                cycleKey: "75",
                label: "Almost There!",
                body: `You are 75% focused on '${title}'! Only a bit more to go.`
            },
            {
                pct: 50,
                cycleKey: "50",
                label: "Halfway There!",
                body: `You're 50% through your goal for ${title}. Keep it up!`
            },
            {
                pct: 0,
                threshold: 1000,
                cycleKey: "1000",
                label: "Milestone Achieved",
                body: `First P1,000 saved for '${title}'! This is just the beginning.`
            }
        ];

        for (const m of milestones) {
            let hit = false;
            if (m.threshold) hit = current >= m.threshold && (current - m.threshold) < 1000;
            else hit = pct >= m.pct;

            if (!hit) continue;

            const suffix = m.threshold || m.pct;
            const type = `goal_${goalId}_${suffix}`;
            const cycleRaw = Number(cycles[m.cycleKey] || 0);
            const cycle = cycleRaw > 0 ? cycleRaw : 1;

            const meta = {
                action: "open_goal_edit",
                goalId,
                source: "goals",
                milestone: String(suffix),
                cycle,
                notificationKey: type
            };

            const alreadyNotified = await this.hasNotified(uid, type, meta);
            if (!alreadyNotified) {
                await this.triggerNotification(uid, m.label, m.body, type, meta);
            }
            break;
        }
    },

    async checkMonthlyComparison(uid) {
        const today = new Date();
        if (today.getDate() !== 1) return;

        try {
            const lastMonth = new Date();
            lastMonth.setMonth(lastMonth.getMonth() - 1);
            const monthName = lastMonth.toLocaleString("default", { month: "long" });
            const monthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;
            const meta = {
                action: "open_budget_overview",
                monthKey,
                notificationKey: `monthly_comparison_${monthKey}`
            };
            const alreadyNotified = this.hasStoredInAppNotification("monthly_comparison", meta)
                || await this.hasNotified(uid, "monthly_comparison", meta);
            if (alreadyNotified) return;

            await this.triggerNotification(
                uid,
                `${monthName} Summary`,
                `New month, new goals! Check your ${monthName} report to see if you beat your 'Best Month' record.`,
                "monthly_comparison",
                meta
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

    async hasNotified(uid, type, meta = null) {
        try {
            const persistentDocId = this.getPersistentNotificationDocId(type, meta);
            if (persistentDocId) {
                const existingDoc = await getDoc(doc(db, `users/${uid}/${NOTIFICATIONS_COLLECTION}`, persistentDocId));
                if (existingDoc.exists()) return true;
            }

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
