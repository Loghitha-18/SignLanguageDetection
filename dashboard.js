// Dashboard.js - SignAlert Dashboard Functionality with Real Data Integration

// Dashboard state
const dashboardState = {
    data: [],
    filteredData: [],
    currentPage: 1,
    itemsPerPage: 10,
    timeFilter: 'day'
};

// DOM elements
const elements = {
    timeFilter: document.getElementById('time-filter'),
    refreshButton: document.getElementById('refresh-data'),
    dangerCount: document.getElementById('danger-count'),
    detectionCount: document.getElementById('detection-count'),
    avgResponse: document.getElementById('avg-response'),
    logTableBody: document.getElementById('log-table-body'),
    prevPageBtn: document.getElementById('prev-page'),
    nextPageBtn: document.getElementById('next-page'),
    pageIndicator: document.getElementById('page-indicator'),
    historyChart: document.getElementById('detectionHistoryChart'),
    distributionChart: document.getElementById('distributionChart'),
    notificationArea: document.getElementById('notification-area') || createNotificationArea()
};

// Create notification area if it doesn't exist
function createNotificationArea() {
    const notificationArea = document.createElement('div');
    notificationArea.id = 'notification-area';
    notificationArea.className = 'notification-area';
    document.body.appendChild(notificationArea);
    return notificationArea;
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    elements.notificationArea.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (elements.notificationArea.contains(notification)) {
                elements.notificationArea.removeChild(notification);
            }
        }, 500);
    }, 5000);
}

// Initialize charts
let historyChartInstance = null;
let distributionChartInstance = null;

function initCharts() {
    // Detection History Chart
    const historyCtx = elements.historyChart.getContext('2d');
    historyChartInstance = new Chart(historyCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'All Detections',
                    data: [],
                    borderColor: '#4a6fdc',
                    backgroundColor: 'rgba(74, 111, 220, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Danger Signs',
                    data: [],
                    borderColor: '#dc3545',
                    backgroundColor: 'rgba(220, 53, 69, 0.1)',
                    tension: 0.3,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });

    // Distribution Chart
    const distributionCtx = elements.distributionChart.getContext('2d');
    distributionChartInstance = new Chart(distributionCtx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#4a6fdc', // Primary
                    '#dc3545', // Danger
                    '#ffc107', // Warning
                    '#28a745', // Success
                    '#17a2b8', // Info
                    '#6c757d', // Secondary
                    '#6610f2', // Purple
                    '#fd7e14'  // Orange
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                }
            }
        }
    });
}

// Load real data from localStorage
function loadRealData() {
    try {
        const savedHistory = localStorage.getItem('signAlertHistory');
        
        if (savedHistory) {
            // Parse the saved history
            const detectionHistory = JSON.parse(savedHistory);
            
            // Process each detection to match dashboard data format
            dashboardState.data = detectionHistory.map(item => {
                return {
                    time: new Date(item.timestamp),
                    signType: item.sign,
                    confidence: item.confidence * 100, // Convert to percentage
                    isDanger: item.isDanger,
                    responseTime: item.responseTime || calculateResponseTime(item),
                    isAlphabet: item.isAlphabet || false
                };
            });
            
            // If no data is available, generate mock data as fallback
            if (dashboardState.data.length === 0) {
                dashboardState.data = generateMockData();
            }
        } else {
            // No real data available, use mock data
            dashboardState.data = generateMockData();
        }
        
        // Apply time filter to data
        filterData();
        
    } catch (error) {
        console.error('Error loading real detection data:', error);
        // Fallback to mock data
        dashboardState.data = generateMockData();
        filterData();
    }
}

// Calculate response time (fallback when not available in real data)
function calculateResponseTime(item) {
    // Create a random but consistent response time based on the sign type
    const hash = hashString(item.sign);
    // Generate a response time between 0.5 and 2.5 seconds
    return ((hash % 20) / 10) + 0.5;
}

// Simple string hash function
function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

// Generate mock data as fallback
function generateMockData(days = 7) {
    const signTypes = ['Help', 'Emergency', 'Stop', 'Yes', 'No', 'Thank You', 'Hello', 'Goodbye'];
    const dangerSigns = ['Help', 'Emergency', 'Stop'];
    const data = [];
    
    // Generate data for the specified number of days
    const now = new Date();
    for (let i = 0; i < days * 24; i++) {
        // Create random entries (more frequent in recent hours)
        const entriesCount = Math.floor(Math.random() * (24 - (i % 24)) / 5) + 1;
        
        for (let j = 0; j < entriesCount; j++) {
            const timeOffset = i * 60 * 60 * 1000; // hours to milliseconds
            const time = new Date(now.getTime() - timeOffset);
            const signType = signTypes[Math.floor(Math.random() * signTypes.length)];
            const confidence = (Math.random() * 30 + 70).toFixed(1); // 70-100%
            const isDanger = dangerSigns.includes(signType);
            const responseTime = (Math.random() * 2 + 0.5).toFixed(2); // 0.5-2.5 seconds
            
            data.push({
                time,
                signType,
                confidence: parseFloat(confidence),
                isDanger,
                responseTime: parseFloat(responseTime)
            });
        }
    }
    
    // Sort by time (newest first)
    return data.sort((a, b) => b.time - a.time);
}

// Filter data based on time range
function filterData() {
    const now = new Date();
    let timeLimit;
    
    switch (dashboardState.timeFilter) {
        case 'day':
            timeLimit = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
            break;
        case 'week':
            timeLimit = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
            break;
        case 'month':
            timeLimit = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
            break;
    }
    
    dashboardState.filteredData = dashboardState.data.filter(item => item.time >= timeLimit);
    dashboardState.currentPage = 1; // Reset to first page when filter changes
    
    updateDashboard();
}

// Update statistics cards
function updateStatistics() {
    const data = dashboardState.filteredData;
    
    // Count danger alerts
    const dangerCount = data.filter(item => item.isDanger).length;
    elements.dangerCount.textContent = dangerCount;
    
    // Total detections
    elements.detectionCount.textContent = data.length;
    
    // Average response time
    const avgResponseTime = data.reduce((sum, item) => sum + item.responseTime, 0) / data.length || 0;
    elements.avgResponse.textContent = avgResponseTime.toFixed(2) + 's';
}

// Update history chart
function updateHistoryChart() {
    const data = dashboardState.filteredData;
    const timeLabels = [];
    const allDetections = [];
    const dangerDetections = [];
    
    // Group data by time period
    const timeGroups = {};
    const dangerGroups = {};
    
    let interval, format;
    switch (dashboardState.timeFilter) {
        case 'day':
            interval = 60 * 60 * 1000; // 1 hour in milliseconds
            format = (time) => time.getHours() + ':00';
            break;
        case 'week':
            interval = 24 * 60 * 60 * 1000; // 1 day in milliseconds
            format = (time) => time.toLocaleDateString('en-US', { weekday: 'short' });
            break;
        case 'month':
            interval = 24 * 60 * 60 * 1000; // 1 day in milliseconds
            format = (time) => time.getDate() + '/' + (time.getMonth() + 1);
            break;
    }
    
    // Create time buckets
    const now = new Date();
    const timeLimit = dashboardState.timeFilter === 'day' ? 24 : 
                     dashboardState.timeFilter === 'week' ? 7 : 30;
                     
    for (let i = 0; i < timeLimit; i++) {
        const timePoint = new Date(now.getTime() - i * interval);
        const label = format(timePoint);
        timeLabels.unshift(label);
        timeGroups[label] = 0;
        dangerGroups[label] = 0;
    }
    
    // Count detections for each time bucket
    data.forEach(item => {
        const label = format(item.time);
        if (timeGroups[label] !== undefined) {
            timeGroups[label]++;
            if (item.isDanger) {
                dangerGroups[label]++;
            }
        }
    });
    
    // Convert groupings to arrays for chart
    for (const label of timeLabels) {
        allDetections.push(timeGroups[label]);
        dangerDetections.push(dangerGroups[label]);
    }
    
    // Update chart dataset
    historyChartInstance.data.labels = timeLabels;
    historyChartInstance.data.datasets[0].data = allDetections;
    historyChartInstance.data.datasets[1].data = dangerDetections;
    historyChartInstance.update();
}

// Update distribution chart
function updateDistributionChart() {
    const data = dashboardState.filteredData;
    
    // Group by sign type
    const signCounts = {};
    data.forEach(item => {
        if (!signCounts[item.signType]) {
            signCounts[item.signType] = 0;
        }
        signCounts[item.signType]++;
    });
    
    // Convert to arrays for chart
    const labels = Object.keys(signCounts);
    const counts = labels.map(label => signCounts[label]);
    
    // Update chart
    distributionChartInstance.data.labels = labels;
    distributionChartInstance.data.datasets[0].data = counts;
    distributionChartInstance.update();
}

// Update detection log table
function updateLogTable() {
    // Calculate pagination
    const startIndex = (dashboardState.currentPage - 1) * dashboardState.itemsPerPage;
    const endIndex = startIndex + dashboardState.itemsPerPage;
    const pageItems = dashboardState.filteredData.slice(startIndex, endIndex);
    
    // Clear current table
    elements.logTableBody.innerHTML = '';
    
    // Add table rows
    pageItems.forEach(item => {
        const row = document.createElement('tr');
        
        // Add danger class if needed
        if (item.isDanger) {
            row.classList.add('danger-row');
        }
        
        // Format time
        const timeString = item.time.toLocaleString();
        
        // Format confidence
        const confidenceString = item.confidence.toFixed(1) + '%';
        
        // Create row content
        row.innerHTML = `
            <td>${timeString}</td>
            <td>${item.signType}${item.isAlphabet ? ' (Alphabet)' : ''}</td>
            <td>${confidenceString}</td>
            <td>${item.responseTime.toFixed(2)}s</td>
        `;
        
        elements.logTableBody.appendChild(row);
    });
    
    // Update pagination controls
    updatePaginationControls();
}

// Update pagination controls
function updatePaginationControls() {
    const totalPages = Math.ceil(dashboardState.filteredData.length / dashboardState.itemsPerPage);
    
    // Update page indicator
    elements.pageIndicator.textContent = `Page ${dashboardState.currentPage} of ${totalPages}`;
    
    // Enable/disable prev/next buttons
    elements.prevPageBtn.disabled = dashboardState.currentPage <= 1;
    elements.nextPageBtn.disabled = dashboardState.currentPage >= totalPages;
}

// Go to previous page
function goToPrevPage() {
    if (dashboardState.currentPage > 1) {
        dashboardState.currentPage--;
        updateLogTable();
    }
}

// Go to next page
function goToNextPage() {
    const totalPages = Math.ceil(dashboardState.filteredData.length / dashboardState.itemsPerPage);
    if (dashboardState.currentPage < totalPages) {
        dashboardState.currentPage++;
        updateLogTable();
    }
}

// Update entire dashboard
function updateDashboard() {
    updateStatistics();
    updateHistoryChart();
    updateDistributionChart();
    updateLogTable();
}

// Initialize dashboard
function initDashboard() {
    // Initialize charts
    initCharts();
    
    // Load data
    loadRealData();
    
    // Set up event listeners
    elements.timeFilter.addEventListener('change', function() {
        dashboardState.timeFilter = this.value;
        filterData();
    });
    
    elements.refreshButton.addEventListener('click', function() {
        loadRealData();
        showNotification('Dashboard data refreshed', 'success');
    });
    
    elements.prevPageBtn.addEventListener('click', goToPrevPage);
    elements.nextPageBtn.addEventListener('click', goToNextPage);
}

// Initialize the dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', initDashboard);