# Bill Reminders - Push Notification Feature

## Overview

Automatically schedules push notifications at 9 AM for unpaid bills. Reminders are shown for today's bills and upcoming bills within the next 30 days.

---

## Features

✅ **9 AM Daily Reminders** - Notifications sent at 9:00 AM on the bill's due date  
✅ **No Duplicates** - Smart deduplication prevents multiple notifications for the same bill  
✅ **Recurring Bills Support** - Handles monthly and yearly recurring bills  
✅ **Paid Bills Excluded** - Only unpaid bills trigger notifications  
✅ **Past Bills Ignored** - No notifications for bills that already passed  
✅ **Auto-Rescheduling** - Updates when bills are added, edited, or synced from another device

---

## How It Works

### 1. When Reminders Are Scheduled

Reminders are automatically scheduled when:
- Bills are loaded on app launch
- A new bill is added
- A bill is edited
- Bills sync from another device (real-time)
- User pulls to refresh

### 2. Notification Timing

- **Scheduled Time:** 9:00 AM on the bill's due date
- **Time Zone:** Uses device's local time zone
- **Delivery:** Native OS notification (Android/iOS)

### 3. Recurring Bills

**Monthly Bills:**
- Sends notification every month on the same day
- Example: "Rent" on day 1 → Notifies on 1st of every month

**Yearly Bills:**
- Sends notification once per year on the same date
- Example: "Insurance" on Aug 15 → Notifies every Aug 15

**One-Time Bills:**
- Single notification on the specific date only

### 4. Deduplication Logic

The system prevents duplicate notifications using multiple strategies:

- **Bill ID + Date Key:** Each bill/date combination tracked separately
- **Notification ID Hashing:** Consistent IDs prevent OS-level duplicates
- **Scheduled Bill Cache:** Local storage tracks which bills already have scheduled notifications
- **Auto-Cleanup:** Old records (>30 days) automatically removed

---

## Notification Format

### Notification Title
```
💳 Bill Reminder
```

### Notification Body Examples

**Today's Bill:**
```
FTES is due today - ₱1,200
```

**Upcoming Bill:**
```
ST VINCENT WATER is due on Aug 30, 2026 - ₱500
```

**No Amount:**
```
Tuition is due on Sep 15, 2026
```

---

## User Experience

### Adding a Bill
1. User adds "Netflix" bill due Aug 10, 2026
2. System schedules notification for Aug 10 at 9:00 AM
3. User sees toast: "🔔 1 bill reminder scheduled"

### Marking Bill as Paid
1. User marks "Netflix" as paid
2. System removes scheduled notification
3. No notification sent on due date

### Syncing from Another Device
1. User adds bill on desktop
2. Bill syncs to mobile within 3 seconds
3. Mobile app automatically schedules notification
4. No user action needed

---

## Technical Implementation

### Files Modified

1. **`wallet app/bill-reminders.js`** (NEW)
   - Core reminder scheduling logic
   - Deduplication system
   - Recurring bill date calculator

2. **`wallet app/calendar-logic.js`**
   - Line 4: Import BillReminders module
   - Line 416: Call `scheduleReminders()` after saving bills
   - Line 293: Schedule reminders after Firestore sync
   - Lines 647-672: New `scheduleReminders()` method

3. **`wallet app/index.html`**
   - Line 18088: Load bill-reminders.js module

### Key Functions

#### `BillReminders.scheduleBillReminders(bills, uid)`
Main scheduling function that:
1. Filters unpaid bills
2. Calculates occurrence dates (handles recurring)
3. Checks for existing scheduled notifications
4. Cancels old notifications to prevent duplicates
5. Schedules new notifications

#### `BillReminders.getBillOccurrenceDates(bill, daysAhead)`
Calculates all dates a bill occurs on for the next N days:
- One-time bills: Returns single date
- Monthly bills: Returns all monthly occurrences
- Yearly bills: Returns yearly occurrences

#### `BillReminders.isBillScheduled(billId, dateStr)`
Checks if a notification is already scheduled for a bill/date combination to prevent duplicates.

---

## Capacitor LocalNotifications API

Uses `@capacitor/local-notifications` plugin (already installed):

### Schedule Notification
```javascript
await plugin.schedule({
    notifications: [{
        id: uniqueId,
        title: "💳 Bill Reminder",
        body: "FTES is due today - ₱1,200",
        schedule: { at: new Date(2026, 7, 18, 9, 0) },
        smallIcon: "ic_stat_wallet",
        iconColor: "#111827",
        extra: {
            type: "bill_reminder",
            billId: "bill_123",
            dateStr: "2026-08-18",
            uid: "user_abc"
        }
    }]
});
```

### Get Pending Notifications
```javascript
const pending = await plugin.getPending();
console.log(pending.notifications); // Array of scheduled notifications
```

### Cancel Notification
```javascript
await plugin.cancel({ 
    notifications: [{ id: uniqueId }] 
});
```

---

## Testing

### Test 1: Schedule Notification
```javascript
// In browser console
const testBill = {
    id: 'test_123',
    title: 'Test Bill',
    amount: 100,
    date: '2026-08-20', // Future date
    paid: false,
    repeat: 'none'
};

await window.BillReminders.scheduleBillReminders([testBill], window.auth.currentUser.uid);
// Expected: Notification scheduled for Aug 20 at 9 AM
```

### Test 2: Check Pending Notifications
```javascript
const plugin = window.Capacitor?.Plugins?.LocalNotifications;
const pending = await plugin.getPending();
console.log('Pending notifications:', pending.notifications);
```

### Test 3: Verify No Duplicates
```javascript
// Schedule same bill twice
await window.BillReminders.scheduleBillReminders([testBill], uid);
await window.BillReminders.scheduleBillReminders([testBill], uid);

// Check pending - should only have 1 notification, not 2
const pending = await plugin.getPending();
const billNotifs = pending.notifications.filter(n => n.extra?.billId === 'test_123');
console.log('Count:', billNotifs.length); // Should be 1
```

### Test 4: Recurring Bill
```javascript
const recurringBill = {
    id: 'rent_123',
    title: 'Rent',
    amount: 5000,
    date: '2026-09-01',
    paid: false,
    repeat: 'monthly'
};

await window.BillReminders.scheduleBillReminders([recurringBill], uid);

// Check - should have notifications for Sept 1, Oct 1, Nov 1, etc.
const pending = await plugin.getPending();
const rentNotifs = pending.notifications.filter(n => n.extra?.billId === 'rent_123');
console.log('Rent notifications:', rentNotifs.length); // Multiple months
```

### Test 5: Paid Bill (No Notification)
```javascript
const paidBill = {
    id: 'paid_123',
    title: 'Paid Bill',
    amount: 200,
    date: '2026-08-25',
    paid: true, // Paid = no notification
    repeat: 'none'
};

await window.BillReminders.scheduleBillReminders([paidBill], uid);

// Check - should have NO notification
const pending = await plugin.getPending();
const paidNotifs = pending.notifications.filter(n => n.extra?.billId === 'paid_123');
console.log('Paid bill notifications:', paidNotifs.length); // Should be 0
```

---

## Console Commands

### Schedule Reminders Manually
```javascript
await window.CalendarView.scheduleReminders()
```

### Check Scheduled Bills Cache
```javascript
console.log(window.BillReminders.getScheduledBills())
```

### Clear Scheduled Bills Cache
```javascript
window.BillReminders.saveScheduledBills({})
```

### Cancel All Bill Reminders
```javascript
await window.BillReminders.cancelAllBillReminders()
```

### Get Upcoming Occurrences
```javascript
const bill = window.CalendarView.bills[0];
const dates = window.BillReminders.getBillOccurrenceDates(bill, 60); // Next 60 days
console.log('Bill occurs on:', dates);
```

---

## Permissions

### Android
LocalNotifications automatically requests permission on first use. No manifest changes needed.

### iOS
- Permissions requested automatically
- User must approve in iOS settings if denied

### Check Permission Status
```javascript
const plugin = window.Capacitor?.Plugins?.LocalNotifications;
const status = await plugin.checkPermissions();
console.log('Permission:', status.display); // "granted" or "denied"
```

---

## Troubleshooting

### Notifications Not Appearing?

1. **Check Permissions**
   ```javascript
   const status = await window.Capacitor?.Plugins?.LocalNotifications.checkPermissions();
   console.log(status);
   ```

2. **Verify Bills Are Scheduled**
   ```javascript
   const pending = await window.Capacitor?.Plugins?.LocalNotifications.getPending();
   console.log('Pending:', pending.notifications);
   ```

3. **Check if User is Authenticated**
   ```javascript
   console.log('User:', window.auth?.currentUser?.uid);
   ```

4. **Verify Bill is Unpaid**
   ```javascript
   const bill = window.CalendarView.bills.find(b => b.id === 'bill_xyz');
   console.log('Paid?', bill.paid); // Should be false
   ```

5. **Check if Date is in Future**
   ```javascript
   const billDate = new Date('2026-08-20');
   const now = new Date();
   console.log('Is future?', billDate > now); // Should be true
   ```

---

## Known Limitations

1. **Maximum Scheduled Notifications**
   - Android: ~500 notifications max
   - iOS: 64 notifications max
   - System clears old notifications when limit reached

2. **Time Zone Changes**
   - Notifications use device's current time zone
   - Changing time zones may shift notification times

3. **App Updates**
   - App updates may clear scheduled notifications
   - Reminders auto-reschedule on next app launch

4. **Battery Optimization**
   - Aggressive battery savers may delay notifications
   - Users may need to whitelist app in battery settings

---

## Future Enhancements

- [ ] Custom notification time (allow 8 AM, 10 AM, etc.)
- [ ] Multi-day advance reminders (e.g., 3 days before due date)
- [ ] Snooze functionality
- [ ] Notification actions (Mark as Paid, View Details)
- [ ] Different notification sounds per bill
- [ ] Reminder history log

---

## Version History

- **v1.0 (2026-08-04)**: Initial implementation
  - 9 AM daily reminders
  - Recurring bill support
  - Deduplication system
  - Auto-rescheduling on sync
