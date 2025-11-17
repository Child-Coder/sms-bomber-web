class SMSBomberWeb {
    constructor() {
        this.isRunning = false;
        this.currentSessionId = null;
        this.sentCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.startTime = null;
        this.statsInterval = null;
        this.initializeApp();
    }

    initializeApp() {
        this.updateCurrentTime();
        setInterval(() => this.updateCurrentTime(), 1000);
        this.setupEventListeners();
        this.loadSystemInfo();
        this.addLog('System initialized successfully', 'info');
    }

    updateCurrentTime() {
        const now = new Date();
        document.getElementById('currentTime').textContent = 
            now.toLocaleTimeString();
    }

    async loadSystemInfo() {
        try {
            const response = await fetch('/api/system-info');
            const data = await response.json();
            if (data.success) {
                document.getElementById('versionInfo').textContent = `v${data.version}`;
                this.addLog(`System loaded - ${data.total_apis} APIs ready`, 'info');
            }
        } catch (error) {
            console.error('Error loading system info:', error);
        }
    }

    setupEventListeners() {
        const form = document.getElementById('bomberForm');
        const stopBtn = document.getElementById('stopBtn');

        form.addEventListener('submit', (e) => this.startBombing(e));
        stopBtn.addEventListener('click', () => this.stopBombing());
    }

    async startBombing(e) {
        e.preventDefault();
        
        const phoneNumber = document.getElementById('phoneNumber').value;
        const smsAmount = parseInt(document.getElementById('smsAmount').value);
        const delayTime = parseFloat(document.getElementById('delayTime').value);

        // Validation
        if (!this.validatePhoneNumber(phoneNumber)) {
            this.addLog('Invalid phone number format. Must be 01XXXXXXXXX', 'error');
            this.showNotification('Invalid phone number format!', 'error');
            return;
        }

        if (smsAmount < 10 || smsAmount > 100) {
            this.addLog('SMS amount must be between 10 and 100', 'error');
            this.showNotification('SMS amount must be between 10-100!', 'error');
            return;
        }

        if (delayTime < 0.5 || delayTime > 5) {
            this.addLog('Delay must be between 0.5 and 5 seconds', 'error');
            this.showNotification('Delay must be between 0.5-5 seconds!', 'error');
            return;
        }

        this.isRunning = true;
        this.resetCounters();
        this.toggleForm(true);

        this.addLog(`Starting SMS campaign to ${phoneNumber}`, 'info');
        this.addLog(`Target: ${smsAmount} SMS, Delay: ${delayTime}s`, 'info');
        this.showNotification('Starting SMS bombing campaign...', 'info');

        try {
            const response = await fetch('/api/start-bombing', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phone: phoneNumber,
                    amount: smsAmount,
                    delay: delayTime
                })
            });

            const result = await response.json();

            if (result.success) {
                this.currentSessionId = result.session_id;
                this.addLog('✅ Bombing started successfully!', 'success');
                this.addLog('🔄 Connecting to APIs...', 'info');
                this.showNotification('Bombing started successfully!', 'success');
                this.startTime = Date.now();
                
                // Start polling for stats
                this.statsInterval = setInterval(() => this.updateRealStats(), 1500);
            } else {
                this.addLog(`❌ Failed to start: ${result.message}`, 'error');
                this.showNotification(`Failed: ${result.message}`, 'error');
                this.toggleForm(false);
                this.isRunning = false;
            }
        } catch (error) {
            this.addLog('❌ Failed to connect to server. Please check if backend is running.', 'error');
            this.showNotification('Server connection failed!', 'error');
            this.toggleForm(false);
            this.isRunning = false;
        }
    }

    async updateRealStats() {
        if (!this.currentSessionId || !this.isRunning) return;

        try {
            const response = await fetch(`/api/session-stats/${this.currentSessionId}`);
            const stats = await response.json();

            if (stats.success) {
                this.sentCount = stats.sent_count;
                this.successCount = stats.success_count;
                this.failedCount = stats.failed_count;
                
                this.updateDashboard();
                
                // Update progress in logs
                const progress = stats.progress_percentage.toFixed(1);
                const elapsed = stats.elapsed_time;
                const speed = stats.speed.toFixed(2);
                
                // Update last log entry with current progress
                const logsContainer = document.getElementById('logsContainer');
                const lastLog = logsContainer.lastChild;
                
                if (stats.is_running) {
                    if (lastLog && lastLog.querySelector('.message').textContent.includes('Progress:')) {
                        lastLog.querySelector('.message').textContent = 
                            `📊 Progress: ${progress}% | Sent: ${this.sentCount} | Success: ${this.successCount} | Speed: ${speed}/s`;
                    } else {
                        this.addLog(`📊 Progress: ${progress}% | Sent: ${this.sentCount} | Success: ${this.successCount} | Speed: ${speed}/s`, 'info');
                    }
                } else {
                    // Session completed
                    this.addLog('✅ Campaign completed successfully!', 'success');
                    this.addLog(`📈 Final Stats: ${this.sentCount} total, ${this.successCount} successful, ${this.failedCount} failed`, 'info');
                    this.showNotification('Campaign completed!', 'success');
                    this.stopBombing();
                }
            } else {
                // Session not found (probably completed)
                this.addLog('✅ Campaign completed!', 'success');
                this.showNotification('Campaign completed!', 'success');
                this.stopBombing();
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
            this.addLog('⚠️ Could not fetch updates from server', 'error');
        }
    }

    async stopBombing() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }

        if (this.currentSessionId && this.isRunning) {
            try {
                const response = await fetch('/api/stop-bombing', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        session_id: this.currentSessionId
                    })
                });
                
                const result = await response.json();
                if (result.success) {
                    this.addLog('🛑 Bombing stopped by user', 'info');
                    this.showNotification('Bombing stopped successfully', 'info');
                }
            } catch (error) {
                console.error('Error stopping bombing:', error);
                this.addLog('⚠️ Error stopping bombing session', 'error');
            }
        }

        this.isRunning = false;
        this.currentSessionId = null;
        this.toggleForm(false);
        this.calculateFinalStats();
    }

    updateDashboard() {
        document.getElementById('sentCount').textContent = this.sentCount;
        document.getElementById('successCount').textContent = this.successCount;
        document.getElementById('failedCount').textContent = this.failedCount;

        // Calculate real-time speed
        if (this.startTime) {
            const elapsed = (Date.now() - this.startTime) / 1000;
            const speed = elapsed > 0 ? (this.sentCount / elapsed).toFixed(2) : '0';
            document.getElementById('speed').textContent = speed;
        }

        // Update progress bar if exists
        this.updateProgressBar();
    }

    updateProgressBar() {
        let progressBar = document.getElementById('progressBar');
        if (!progressBar) {
            // Create progress bar if it doesn't exist
            const logsPanel = document.querySelector('.logs-panel');
            progressBar = document.createElement('div');
            progressBar.id = 'progressBar';
            progressBar.style.cssText = `
                width: 100%;
                height: 6px;
                background: #e1e5e9;
                border-radius: 3px;
                margin: 10px 0;
                overflow: hidden;
            `;
            
            const progressFill = document.createElement('div');
            progressFill.id = 'progressFill';
            progressFill.style.cssText = `
                height: 100%;
                background: linear-gradient(90deg, #667eea, #764ba2);
                border-radius: 3px;
                width: 0%;
                transition: width 0.3s ease;
            `;
            
            progressBar.appendChild(progressFill);
            logsPanel.querySelector('.logs-container').parentNode.insertBefore(progressBar, logsPanel.querySelector('.logs-container'));
        }

        const progressFill = document.getElementById('progressFill');
        const amount = parseInt(document.getElementById('smsAmount').value);
        const progress = amount > 0 ? (this.sentCount / amount) * 100 : 0;
        progressFill.style.width = `${Math.min(progress, 100)}%`;
    }

    calculateFinalStats() {
        if (this.startTime) {
            const totalTime = (Date.now() - this.startTime) / 1000;
            const speed = (this.sentCount / totalTime).toFixed(2);
            const successRate = this.sentCount > 0 ? ((this.successCount / this.sentCount) * 100).toFixed(1) : '0';

            this.addLog(`📊 Final Report:`, 'info');
            this.addLog(`   ⏱️ Total Time: ${totalTime.toFixed(1)}s`, 'info');
            this.addLog(`   📨 Total Sent: ${this.sentCount}`, 'info');
            this.addLog(`   ✅ Successful: ${this.successCount}`, 'success');
            this.addLog(`   ❌ Failed: ${this.failedCount}`, 'error');
            this.addLog(`   📈 Success Rate: ${successRate}%`, 'info');
            this.addLog(`   🚀 Average Speed: ${speed} SMS/second`, 'info');
        }
    }

    addLog(message, type = 'info') {
        const logsContainer = document.getElementById('logsContainer');
        const logEntry = document.createElement('div');
        
        logEntry.className = `log-entry ${type}`;
        logEntry.innerHTML = `
            <span class="timestamp">${new Date().toLocaleTimeString()}</span>
            <span class="message">${message}</span>
        `;

        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight;

        // Keep only last 50 logs to prevent memory issues
        const logs = logsContainer.querySelectorAll('.log-entry');
        if (logs.length > 50) {
            logs[0].remove();
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            transform: translateX(400px);
            transition: transform 0.3s ease;
            max-width: 300px;
        `;

        // Set background color based on type
        const colors = {
            info: 'linear-gradient(135deg, #667eea, #764ba2)',
            success: 'linear-gradient(135deg, #4CAF50, #45a049)',
            error: 'linear-gradient(135deg, #f44336, #d32f2f)'
        };

        notification.style.background = colors[type] || colors.info;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        // Remove after 4 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    validatePhoneNumber(phone) {
        return /^01\d{9}$/.test(phone);
    }

    resetCounters() {
        this.sentCount = 0;
        this.successCount = 0;
        this.failedCount = 0;
        this.startTime = null;
        this.updateDashboard();
        
        // Clear logs
        const logsContainer = document.getElementById('logsContainer');
        logsContainer.innerHTML = `
            <div class="log-entry info">
                <span class="timestamp">${new Date().toLocaleTimeString()}</span>
                <span class="message">System ready. Enter target details to start.</span>
            </div>
        `;

        // Reset progress bar
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = '0%';
        }
    }

    toggleForm(disabled) {
        const inputs = document.querySelectorAll('#bomberForm input, #bomberForm button');
        const stopBtn = document.getElementById('stopBtn');
        
        inputs.forEach(input => {
            if (input.type !== 'button' || input.id !== 'stopBtn') {
                input.disabled = disabled;
            }
        });
        
        stopBtn.disabled = !disabled;
        
        // Update button text based on state
        const submitBtn = document.querySelector('#bomberForm button[type="submit"]');
        if (disabled) {
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
        } else {
            submitBtn.innerHTML = '<i class="fas fa-play"></i> Start Bombing';
        }
    }

    // Additional utility methods
    async testAPIs() {
        this.addLog('Testing API connectivity...', 'info');
        try {
            const response = await fetch('/api/test-apis');
            const result = await response.json();
            
            if (result.success) {
                const working = result.test_results.filter(r => r.status === 'working').length;
                const total = result.test_results.length;
                this.addLog(`✅ API Test: ${working}/${total} APIs working`, 'success');
            }
        } catch (error) {
            this.addLog('❌ API test failed', 'error');
        }
    }

    async getActiveSessions() {
        try {
            const response = await fetch('/api/active-sessions');
            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error fetching active sessions:', error);
            return { success: false, sessions: [] };
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.smsBomber = new SMSBomberWeb();
    
    // Add some global event listeners
    document.addEventListener('keydown', (e) => {
        // Stop on Escape key
        if (e.key === 'Escape' && window.smsBomber.isRunning) {
            window.smsBomber.stopBombing();
        }
    });
});

// Add CSS for notifications
const notificationStyles = `
.notification {
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    border-left: 4px solid rgba(255,255,255,0.5);
}
`;
const styleSheet = document.createElement('style');
styleSheet.textContent = notificationStyles;
document.head.appendChild(styleSheet);
