/**
 * Bill Reminders - Push Notification Scheduler
 * Schedules daily 9 AM reminders for unpaid bills
 */

import { NotificationsEngine } from "./notifications-engine.js";

export const BillReminders = {
    REMINDER_HOUR: 9, // 9 AM
    REMINDER_MINUTE: 0,
    SCHEDULED_BILLS_KEY: "smartwallet_scheduled_bill_reminders_v1",
    
    /**
     * Get the list of bill IDs that have been scheduled for notifications
     */
    getScheduledBills() {
        try {
            const stored = localStorage.getItem(this.SCHEDULED_BILLS_KEY);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.warn("Failed to load scheduled bills:", e);
            return {};
        }
    },
    
    /**
     * Save the list of scheduled bill IDs
     */
    saveScheduledBills(scheduled) {
        try {
            localStorage.setItem(this.SCHEDULED_BILLS_KEY, JSON.stringify(scheduled));
        } catch (e) {
            console.warn("Failed to save scheduled bills:", e);
        }
    },
    
    /**
     * Mark a bill as having a scheduled notification
     */
    markBillScheduled(billId, scheduledDateStr, notificationId) {
        const scheduled = this.getScheduledBills();
        scheduled[`${billId}_${scheduledDateStr}`] = {
            billId,
            dateStr: scheduledDateStr,
            notificationId,
            scheduledAt: Date.now()
        };
        this.saveScheduledBills(scheduled);
    },
    
    /**
     * Check if a bill already has a scheduled notification for a specific date
     */
    isBillScheduled(billId, scheduledDateStr) {
        const scheduled = this.getScheduledBills();
        return Boolean(scheduled[`${billId}_${scheduledDateStr}`]);
    },
    
    /**
     * Clear old scheduled bill records (older than 30 days)
     */
    clearOldScheduledBills() {
        const scheduled = this.getScheduledBills();
        const now = Date.now();
        const thirtyDaysAgo = now - (30 * 86400000);
        
        const filtered = {};
        for (const [key, value] of Object.entries(scheduled)) {
            if (value.scheduledAt > thirtyDaysAgo) {
                filtered[key] = value;
            }
        }
        
        this.saveScheduledBills(filtered);
    },
    
    /**
     * Get next 9 AM for a given date
     */
    getNext9AM(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        date.setHours(this.REMINDER_HOUR, this.REMINDER_MINUTE, 0, 0);
        return date;
    },
    
    /**
     * Check if a date is in the past (before today)
     */
    isDateInPast(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date < today;
    },
    
    /**
     * Check if a date is today
     */
    isDateToday(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return date.getTime() === today.getTime();
    },
    
    /**
     * Cancel all pending bill reminder notifications
     */
    async cancelAllBillReminders() {
        const plugin = NotificationsEngine.getLocalNotificationsPlugin();
        if (!plugin) return;
        
        try {
            // Get all pending notifications
            const pending = await plugin.getPending();
            
            // Filter for bill reminders (those with type: "bill_reminder" in extra)
            const billReminderIds = pending.notifications
                .filter(n => n.extra?.type === 'bill_reminder')
                .map(n => n.id);
            
            if (billReminderIds.length > 0) {
                await plugin.cancel({ notifications: billReminderIds.map(id => ({ id })) });
                console.log(`Cancelled ${billReminderIds.length} bill reminder notifications`);
            }
        } catch (e) {
            console.warn("Failed to cancel bill reminders:", e);
        }
    },
    
    /**
     * Schedule notifications for all unpaid bills
     */
    async scheduleBillReminders(bills = [], uid = null) {
        if (!uid) {
            console.warn("Cannot schedule bill reminders: user not authenticated");
            return;
        }
        
        if (!Array.isArray(bills) || bills.length === 0) {
            console.log("No bills to schedule reminders for");
            return;
        }
        
        const plugin = NotificationsEngine.getLocalNotificationsPlugin();
        if (!plugin) {
            console.warn("LocalNotifications plugin not available");
            return;
        }
        
        // Ensure permissions
        const allowed = await NotificationsEngine.ensureLocalPermissions();
        if (!allowed) {
            console.warn("Notification permissions not granted");
            return;
        }
        
        // Clear old records
        this.clearOldScheduledBills();
        
        // Cancel all existing bill reminders first to avoid duplicates
        await this.cancelAllBillReminders();
        
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
        // Get bills that need reminders
        const billsToSchedule = [];
        
        for (const bill of bills) {
            // Skip paid bills
            if (bill.paid) continue;
            
            // Skip bills with no date
            if (!bill.date) continue;
            
            // Skip bills in the past (but allow today)
            if (this.isDateInPast(bill.date)) continue;
            
            // Get the dates this bill occurs on (handle recurring bills)
            const dates = this.getBillOccurrenceDates(bill, 30); // Next 30 days
            
            for (const dateStr of dates) {
                // Skip past dates
                if (this.isDateInPast(dateStr)) continue;
                
                // Skip if already scheduled
                if (this.isBillScheduled(bill.id, dateStr)) continue;
                
                billsToSchedule.push({
                    bill,
                    dateStr
                });
            }
        }
        
        console.log(`📅 Scheduling ${billsToSchedule.length} bill reminders`);
        
        // Schedule notifications
        const notifications = [];
        for (const { bill, dateStr } of billsToSchedule) {
            const reminderDate = this.getNext9AM(dateStr);
            
            // Only schedule if reminder date is in the future
            if (reminderDate <= now) continue;
            
            const title = `💳 Bill Reminder`;
            const body = `${bill.title} is due ${this.isDateToday(dateStr) ? 'today' : 'on ' + this.formatDate(dateStr)}${bill.amount ? ' - ₱' + bill.amount.toLocaleString() : ''}`;
            
            const notificationId = NotificationsEngine.createNativeNotificationId(`bill_${bill.id}_${dateStr}`);
            
            notifications.push({
                id: notificationId,
                title,
                body,
                schedule: { at: reminderDate },
                smallIcon: "ic_stat_wallet",
                iconColor: "#111827",
                extra: {
                    type: "bill_reminder",
                    billId: bill.id,
                    dateStr,
                    uid
                }
            });
            
            // Mark as scheduled
            this.markBillScheduled(bill.id, dateStr, notificationId);
        }
        
        if (notifications.length > 0) {
            try {
                await plugin.schedule({ notifications });
                console.log(`✅ Scheduled ${notifications.length} bill reminder notifications`);
                
                // Show confirmation toast
                if (window.showToast) {
                    window.showToast(`🔔 ${notifications.length} bill reminder${notifications.length > 1 ? 's' : ''} scheduled`);
                }
            } catch (e) {
                console.error("Failed to schedule bill reminders:", e);
            }
        } else {
            console.log("No new bill reminders to schedule");
        }
    },
    
    /**
     * Get the dates a bill occurs on (handle recurring bills)
     */
    getBillOccurrenceDates(bill, daysAhead = 30) {
        const dates = [];
        const startDate = new Date(bill.date + 'T00:00:00');
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const endDate = new Date(now.getTime() + (daysAhead * 86400000));
        
        const repeat = bill.repeat || 'monthly';
        
        if (repeat === 'none' || repeat === 'this_month') {
            // One-time bill
            if (startDate >= now && startDate <= endDate) {
                dates.push(bill.date);
            }
        } else if (repeat === 'monthly') {
            // Monthly recurring - same day each month
            const billDay = startDate.getDate();
            
            for (let d = new Date(now); d <= endDate; d.setMonth(d.getMonth() + 1)) {
                // Clone date to avoid mutation
                const testDate = new Date(d.getFullYear(), d.getMonth(), billDay);
                
                // Handle months with fewer days (e.g., Feb 31 -> Feb 28)
                if (testDate.getMonth() !== d.getMonth()) {
                    testDate.setDate(0); // Last day of previous month
                }
                
                if (testDate >= now && testDate <= endDate) {
                    const dateStr = `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, '0')}-${String(testDate.getDate()).padStart(2, '0')}`;
                    dates.push(dateStr);
                }
            }
        } else if (repeat === 'yearly') {
            // Yearly recurring - same day and month each year
            const billDay = startDate.getDate();
            const billMonth = startDate.getMonth();
            
            for (let year = now.getFullYear(); year <= endDate.getFullYear() + 1; year++) {
                const testDate = new Date(year, billMonth, billDay);
                
                if (testDate >= now && testDate <= endDate) {
                    const dateStr = `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, '0')}-${String(testDate.getDate()).padStart(2, '0')}`;
                    dates.push(dateStr);
                }
            }
        }
        
        return dates;
    },
    
    /**
     * Format a date string for display
     */
    formatDate(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },
    
    /**
     * Initialize bill reminders (call when bills are loaded or updated)
     */
    async init(bills = [], uid = null) {
        if (!uid) {
            uid = window.auth?.currentUser?.uid;
        }
        
        if (!uid) {
            console.warn("Cannot initialize bill reminders: user not authenticated");
            return;
        }
        
        console.log("🔔 Initializing bill reminders...");
        await this.scheduleBillReminders(bills, uid);
    }
};

// Export to window for console access
if (typeof window !== 'undefined') {
    window.BillReminders = BillReminders;
}
