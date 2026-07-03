// Add this function to budget-analysis-overlay.js to update x-axis labels dynamically

function updateChartXAxisLabels() {
    // Get the labels from budgetData
    const labels = budgetData.trendLabels || ['W1', 'W2', 'W3', 'W4', 'W5'];
    
    console.log('Updating x-axis labels to:', labels);
    
    // Find all x-axis label elements (they might have a class or be in a specific container)
    // Common patterns:
    // 1. Elements with class like 'x-label', 'week-label', 'trend-label'
    // 2. Text elements in the SVG
    // 3. Div elements below the chart
    
    // Try to find and update them
    const labelElements = document.querySelectorAll('.trend-x-label, .week-label, .chart-x-label');
    if (labelElements.length > 0) {
        labelElements.forEach((el, idx) => {
            if (idx < labels.length) {
                el.textContent = labels[idx];
            }
        });
    }
    
    // If labels are in SVG text elements
    const svgLabels = document.querySelectorAll('#budget-analysis-line-svg text.x-axis-label');
    if (svgLabels.length > 0) {
        svgLabels.forEach((el, idx) => {
            if (idx < labels.length) {
                el.textContent = labels[idx];
            }
        });
    }
    
    // If there's a container holding the labels
    const labelContainer = document.getElementById('trend-x-labels') || document.querySelector('.trend-x-labels');
    if (labelContainer) {
        labelContainer.innerHTML = labels.map(label => 
            `<span class="trend-x-label">${label}</span>`
        ).join('');
    }
}

// Call this after rendering the chart in renderTrendChart()
