/**
 * Local AI Intelligence Engine
 * Provides heuristic-based financial analysis when Gemini/Cloud APIs are unavailable.
 */
import { getMerchantDisplay, CATEGORIES } from "./app-utils.js";

export const LocalAI = {
    /**
     * Generates a 2-sentence financial insight based on transaction data.
     * @param {Array} txns - List of current month transaction objects.
     * @param {Object} history - Optional historical context { avgTotal: 0, recurring: [], spikes: [] }
     * @returns {string} 
     */
    analyze(txns, history = null) {
        if (!txns || txns.length === 0) return "No recent activity to analyze. Start adding transactions to see insights!";

        // 1. Basic Aggregation
        const totalSpent = txns.reduce((sum, t) => sum + (t.manualAmount || t.amount || 0), 0);
        const categoryTotals = {};
        const merchantTotals = {};
        let smallBuysCount = 0;
        let smallBuysTotal = 0;

        txns.forEach(t => {
            const amt = t.manualAmount || t.amount || 0;
            const mapped = getMerchantDisplay(t.merchant, t);
            const cat = mapped.category;
            const mName = mapped.name || t.merchant;
            
            categoryTotals[cat] = (categoryTotals[cat] || 0) + amt;
            merchantTotals[mName] = (merchantTotals[mName] || 0) + amt;

            if (amt > 0 && amt < 200) { smallBuysCount++; smallBuysTotal += amt; }
        });

        const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
        const topMerchant = Object.entries(merchantTotals).sort((a, b) => b[1] - a[1])[0];
        
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        
        // 2. Intelligence Heuristics
        let lines = [];
        let analysis = "";

        if (history && history.avgTotal && totalSpent > history.avgTotal * 1.1) {
            const diff = totalSpent - history.avgTotal;
            analysis = `You spent **₱${Math.round(totalSpent)}**, which is **₱${Math.round(diff)} higher** than your recent average. `;
        } else if (topMerchant && topMerchant[1] > totalSpent * 0.3) {
            analysis = `**${topMerchant[0]}** is your leading expense this month, taking up **₱${Math.round(topMerchant[1])}**. `;
        } else if (topCategory) {
            analysis = `Most of your spending went to **${topCategory[0]}** (**₱${Math.round(topCategory[1])}**). `;
        }
        
        analysis += `Your daily average for the month is **₱${Math.round(totalSpent/daysInMonth)}**.`;
        lines.push(analysis);

        // 3. Recommendation: Smart learning from clusters
        lines.push(""); 
        let recFound = false;

        // Priority 1: High Recurring Cost
        if (history && history.recurring && history.recurring.length > 0) {
            const topRec = history.recurring[0];
            const currentRecAmt = merchantTotals[topRec.name] || 0;
            if (currentRecAmt > 0) {
                lines.push(`**Recommendation:** Your recurring spending with **${topRec.name}** is a major budget driver. Cutting this down would save you around **₱${Math.round(topRec.avgCost * 0.5)}** per month.`);
                recFound = true;
            }
        }

        // Priority 2: Specific Spike
        if (!recFound && history && history.spikes && history.spikes.length > 0) {
            lines.push(`**Recommendation:** Your **${history.spikes[0]}** spending is significantly higher than your history. Review these specific transactions to find savings.`);
            recFound = true;
        }

        // Priority 3: Merchant Total
        if (!recFound && topMerchant) {
            lines.push(`**Recommendation:** Focus on reducing your **₱${Math.round(topMerchant[1])}** spend at **${topMerchant[0]}**. This is the most effective way to lower this month's total.`);
            recFound = true;
        }

        if (!recFound) {
            lines.push(`**Recommendation:** Focus on the **${topCategory ? topCategory[0] : 'miscellaneous'}** category next month to improve your overall savings.`);
        }

        // 4. Smart Tip
        lines.push("");
        if (smallBuysTotal > 1500) {
            lines.push(`**Tip:** Pay attention to small daily purchases. They've added up to **₱${Math.round(smallBuysTotal)}** this month alone.`);
        } else if (topMerchant) {
            lines.push(`**Tip:** Keep an eye out for specific promo days or use a loyalty card at **${topMerchant[0]}** to shave off extra costs.`);
        } else {
            lines.push(`**Tip:** Before making your next non-essential purchase, try waiting 24 hours to see if you really need it.`);
        }

        return lines.join("\n");
    }
};
