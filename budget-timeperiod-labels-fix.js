// COMPREHENSIVE FIX FOR TIME PERIOD LABELS
// This needs to be integrated into budget-analysis-overlay.js

// Summary of changes needed:
// 1. Last 7 Days: 7 points - Sun, Mon, Tue, Wed, Thu, Fri, Sat
// 2. Last 3 Months: 12 weeks - "Apr W1", "Apr W2", "Apr W3", "Apr W4", "May W1", etc.
// 3. Last 6 Months: 6 months - Feb, Mar, Apr, May, Jun, Jul
// 4. Entire Year: 12 months - Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec
// 5. Entire Lifetime: Quarterly - Q1 2024, Q2 2024, Q3 2024, etc. (or 3-month increments)

// For Last 3 Months - need to change from 5 segments to 12 weekly segments
if (filterVal === 'last_3_months') {
    const monthsBack = 3;
    const today = new Date();
    const weeks = [];
    
    // Generate ALL weeks for the past 3 months
    for (let m = monthsBack - 1; m >= 0; m--) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
        const monthName = monthDate.toLocaleDateString('en-US', { month: 'short' });
        const lastDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
        
        for (let weekNum = 1; weekNum <= 4; weekNum++) {
            const startDay = (weekNum - 1) * 7 + 1;
            const endDay = Math.min(weekNum * 7, lastDay);
            weeks.push({
                label: `${monthName} W${weekNum}`,
                startTime: new Date(monthDate.getFullYear(), monthDate.getMonth(), startDay, 0, 0, 0).getTime(),
                endTime: new Date(monthDate.getFullYear(), monthDate.getMonth(), endDay, 23, 59, 59).getTime()
            });
        }
    }
    
    // Use ALL weeks (should be 12 weeks for 3 months)
    weeks.forEach((week, idx) => {
        if (idx < trends.all.length) {
            trendLabels[idx] = week.label;
        }
    });
    
    budgetData.transactions.all.forEach(t => {
        weeks.forEach((week, idx) => {
            if (idx < trends.all.length && t.timestamp >= week.startTime && t.timestamp <= week.endTime) {
                trends.all[idx] += t.amount;
                if (t.bucket === 'needs') trends.needs[idx] += t.amount;
                if (t.bucket === 'wants') trends.wants[idx] += t.amount;
                if (t.bucket === 'savings') trends.savings[idx] += t.amount;
            }
        });
    });
}

// For Last 6 Months - show 6 month labels
else if (filterVal === 'last_6_months') {
    const monthsBack = 6;
    const today = new Date();
    const months = [];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let m = monthsBack - 1; m >= 0; m--) {
        const monthDate = new Date(today.getFullYear(), today.getMonth() - m, 1);
        months.push({
            label: monthNames[monthDate.getMonth()],
            startTime: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 0, 0, 0).getTime(),
            endTime: new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0, 23, 59, 59).getTime()
        });
    }
    
    months.forEach((month, idx) => {
        trendLabels[idx] = month.label;
    });
    
    budgetData.transactions.all.forEach(t => {
        months.forEach((month, idx) => {
            if (t.timestamp >= month.startTime && t.timestamp <= month.endTime) {
                trends.all[idx] += t.amount;
                if (t.bucket === 'needs') trends.needs[idx] += t.amount;
                if (t.bucket === 'wants') trends.wants[idx] += t.amount;
                if (t.bucket === 'savings') trends.savings[idx] += t.amount;
            }
        });
    });
}

// For Entire Year - show all 12 months
else if (filterVal === 'this_year') {
    const year = new Date().getFullYear();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    for (let m = 0; m < 12; m++) {
        trendLabels[m] = monthNames[m];
    }
    
    budgetData.transactions.all.forEach(t => {
        const txnDate = new Date(t.timestamp);
        if (txnDate.getFullYear() === year) {
            const monthIdx = txnDate.getMonth();
            trends.all[monthIdx] += t.amount;
            if (t.bucket === 'needs') trends.needs[monthIdx] += t.amount;
            if (t.bucket === 'wants') trends.wants[monthIdx] += t.amount;
            if (t.bucket === 'savings') trends.savings[monthIdx] += t.amount;
        }
    });
}

// For Entire Lifetime - show quarterly or 3-month periods
else if (filterVal === 'all_time') {
    const sortedTxns = [...budgetData.transactions.all].sort((a, b) => a.timestamp - b.timestamp);
    if (sortedTxns.length > 0) {
        const minDate = new Date(sortedTxns[0].timestamp);
        const maxDate = new Date(sortedTxns[sortedTxns.length - 1].timestamp);
        
        const quarters = [];
        let currentDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
        const endDate = new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
        
        while (currentDate <= endDate) {
            const quarterStart = new Date(currentDate);
            const quarterEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0, 23, 59, 59);
            const qNum = Math.floor(currentDate.getMonth() / 3) + 1;
            
            quarters.push({
                label: `Q${qNum} ${currentDate.getFullYear()}`,
                startTime: quarterStart.getTime(),
                endTime: Math.min(quarterEnd.getTime(), maxDate.getTime())
            });
            
            currentDate.setMonth(currentDate.getMonth() + 3);
        }
        
        // Distribute quarters into available trend points
        const segmentSize = Math.ceil(quarters.length / trends.all.length);
        for (let i = 0; i < trends.all.length; i++) {
            const startIdx = i * segmentSize;
            const endIdx = Math.min((i + 1) * segmentSize, quarters.length);
            
            if (startIdx < quarters.length) {
                trendLabels[i] = quarters[startIdx].label;
                
                budgetData.transactions.all.forEach(t => {
                    for (let q = startIdx; q < endIdx; q++) {
                        const quarter = quarters[q];
                        if (t.timestamp >= quarter.startTime && t.timestamp <= quarter.endTime) {
                            trends.all[i] += t.amount;
                            if (t.bucket === 'needs') trends.needs[i] += t.amount;
                            if (t.bucket === 'wants') trends.wants[i] += t.amount;
                            if (t.bucket === 'savings') trends.savings[i] += t.amount;
                            break;
                        }
                    }
                });
            }
        }
    }
}
