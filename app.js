document.addEventListener('DOMContentLoaded', () => {
    // ----------------------------------------------------
    // 6. App State Object & Global Utilities
    // ----------------------------------------------------
    const keyboardFooter = document.querySelector('.keyboard-footer');
    function toggleKeyboard(show) {
        if (keyboardFooter) {
            if (show) keyboardFooter.classList.remove('keyboard-hidden');
            else keyboardFooter.classList.add('keyboard-hidden');
        }
    }

    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' && !['gemini-api-key', 'ai-topic-input'].includes(e.target.id)) {
            toggleKeyboard(true);
            
            if (['keyboard-input', 'train-keyboard-input', 'ai-keyboard-input'].includes(e.target.id)) {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => console.log('Fullscreen blocked', err));
                }
            }
        }
    });
    document.addEventListener('focusout', (e) => {
        if (e.target.tagName === 'INPUT') {
            toggleKeyboard(false);
        }
    });
    const state = {
        activeTab: 'training',
        currentRetryFn: null,
        practice: { text: '', currentIndex: 0, startTime: null, timer: null, timeLimit: 30, mode: 'time', category: 'quotes', errors: 0, typedKeys: 0, isActive: false, wpmHistory: [] },
        training: { activeLessonIndex: 0, text: '', currentIndex: 0, startTime: null, errors: 0, typedKeys: 0, isActive: false, completedLessons: new Set(JSON.parse(localStorage.getItem('ntype_training_progress')) || []) },
        aiTopic: { text: '', currentIndex: 0, startTime: null, errors: 0, typedKeys: 0, isActive: false, currentTopic: '', wpmHistory: [] },
        history: JSON.parse(localStorage.getItem('ntype_history')) || []
    };

    // ----------------------------------------------------
    // 1. Web Audio Sound Engine
    // ----------------------------------------------------
    let audioCtx = null;
    let soundEnabled = true;

    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSound(type) {
        if (!soundEnabled) return;
        initAudio();
        if (!audioCtx) return;

        const t = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'click') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(180, t);
            osc.frequency.exponentialRampToValueAtTime(120, t + 0.04);
            gainNode.gain.setValueAtTime(0.12, t);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            osc.start(t);
            osc.stop(t + 0.04);
        } else if (type === 'space') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(120, t);
            osc.frequency.exponentialRampToValueAtTime(80, t + 0.06);
            gainNode.gain.setValueAtTime(0.15, t);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
            osc.start(t);
            osc.stop(t + 0.06);
        } else if (type === 'error') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(240, t);
            osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);
            gainNode.gain.setValueAtTime(0.1, t);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            osc.start(t);
            osc.stop(t + 0.12);
        } else if (type === 'success') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(523.25, t); // C5
            osc.frequency.setValueAtTime(659.25, t + 0.08); // E5
            gainNode.gain.setValueAtTime(0.12, t);
            gainNode.gain.linearRampToValueAtTime(0, t + 0.2);
            osc.start(t);
            osc.stop(t + 0.2);
        } else if (type === 'combo') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, t);
            osc.frequency.exponentialRampToValueAtTime(440, t + 0.15);
            gainNode.gain.setValueAtTime(0.08, t);
            gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            osc.start(t);
            osc.stop(t + 0.15);
        }
    }

    // ----------------------------------------------------
    // 2. Background Particle System
    // ----------------------------------------------------
    const bgCanvas = document.getElementById('bg-particles');
    const bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
    let particles = [];

    function resizeBgCanvas() {
        if (!bgCanvas) return;
        bgCanvas.width = window.innerWidth;
        bgCanvas.height = window.innerHeight;
    }

    function initBgParticles() {
        if (!bgCanvas) return;
        resizeBgCanvas();
        particles = [];
        for (let i = 0; i < 50; i++) {
            particles.push({
                x: Math.random() * bgCanvas.width,
                y: Math.random() * bgCanvas.height,
                size: Math.random() * 2 + 0.5,
                speedX: (Math.random() - 0.5) * 0.6,
                speedY: (Math.random() - 0.5) * 0.6,
                alpha: Math.random() * 0.4 + 0.1
            });
        }
    }

    function animateBgParticles() {
        if (!bgCtx) return;
        bgCtx.clearRect(0, 0, bgCanvas.width, bgCanvas.height);
        const isDark = document.body.classList.contains('dark-theme');
        bgCtx.fillStyle = isDark ? '#22d3ee' : '#0891b2';

        particles.forEach(p => {
            p.x += p.speedX;
            p.y += p.speedY;

            if (p.x < 0) p.x = bgCanvas.width;
            if (p.x > bgCanvas.width) p.x = 0;
            if (p.y < 0) p.y = bgCanvas.height;
            if (p.y > bgCanvas.height) p.y = 0;

            bgCtx.globalAlpha = p.alpha;
            bgCtx.beginPath();
            bgCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            bgCtx.fill();
        });
        requestAnimationFrame(animateBgParticles);
    }
    window.addEventListener('resize', resizeBgCanvas);
    if (bgCanvas) {
        initBgParticles();
        animateBgParticles();
    }

    // ----------------------------------------------------
    // 3. Toast Notification System
    // ----------------------------------------------------
    const toastContainer = document.getElementById('toast-container') || document.body;

    function showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let iconClass = 'fa-circle-info';
        if (type === 'success') iconClass = 'fa-check';
        if (type === 'error') iconClass = 'fa-xmark';

        const icon = document.createElement('i');
        icon.className = `fa-solid ${iconClass}`;
        
        const text = document.createElement('span');
        text.textContent = message;

        toast.appendChild(icon);
        toast.appendChild(text);
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, duration);
    }

    // ----------------------------------------------------
    // 4. Confetti System
    // ----------------------------------------------------
    const confettiCanvas = document.getElementById('confetti-canvas');
    const confettiCtx = confettiCanvas ? confettiCanvas.getContext('2d') : null;
    let confetti = [];
    let confettiAnimationId = null;

    function resizeConfetti() {
        if (!confettiCanvas) return;
        confettiCanvas.width = window.innerWidth;
        confettiCanvas.height = window.innerHeight;
    }

    function launchConfetti() {
        if (!confettiCtx) return;
        resizeConfetti();
        confetti = [];
        const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316'];
        
        for (let i = 0; i < 120; i++) {
            confetti.push({
                x: confettiCanvas.width / 2 + (Math.random() - 0.5) * 200,
                y: -50,
                w: Math.random() * 10 + 5,
                h: Math.random() * 10 + 5,
                vx: (Math.random() - 0.5) * 15,
                vy: Math.random() * 5 + 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10,
                life: 1.0
            });
        }

        if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId);
        
        const animate = () => {
            confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            let active = false;
            
            confetti.forEach(c => {
                c.x += c.vx;
                c.y += c.vy;
                c.vy += 0.15; // gravity
                c.vx += (Math.random() - 0.5) * 0.5; // wind
                c.rotation += c.rotSpeed;
                c.life -= 0.005;

                if (c.life > 0) {
                    active = true;
                    confettiCtx.save();
                    confettiCtx.translate(c.x, c.y);
                    confettiCtx.rotate(c.rotation * Math.PI / 180);
                    confettiCtx.globalAlpha = c.life;
                    confettiCtx.fillStyle = c.color;
                    confettiCtx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
                    confettiCtx.restore();
                }
            });

            if (active) {
                confettiAnimationId = requestAnimationFrame(animate);
            } else {
                confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            }
        };
        animate();
    }
    window.addEventListener('resize', resizeConfetti);

    // ----------------------------------------------------
    // 5. Results Modal System
    // ----------------------------------------------------
    const resultsModal = document.getElementById('results-modal');
    const resultChartCanvas = document.getElementById('result-chart');

    function showResults(data) {
        if (!resultsModal) return;
        const { wpm, accuracy, rawWpm, time, chars, errors, wpmHistory } = data;

        document.getElementById('result-wpm').textContent = wpm;
        document.getElementById('result-accuracy').textContent = `${accuracy}%`;
        document.getElementById('result-raw-wpm').textContent = rawWpm;
        document.getElementById('result-time').textContent = `${time}s`;
        document.getElementById('result-chars').textContent = chars;
        document.getElementById('result-errors').textContent = errors;

        const titleEl = document.getElementById('result-title');
        const subtitleEl = document.getElementById('result-subtitle');

        if (wpm >= 60) {
            titleEl.textContent = 'Excellent!';
            launchConfetti();
        } else if (wpm >= 40) {
            titleEl.textContent = 'Great Job!';
        } else {
            titleEl.textContent = 'Keep Practicing!';
        }
        subtitleEl.textContent = `You typed at ${wpm} WPM with ${accuracy}% accuracy`;

        drawChart(resultChartCanvas, wpmHistory);
        resultsModal.classList.remove('hidden');
    }

    function drawChart(canvas, data) {
        if (!canvas || !data || data.length === 0) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width = canvas.parentElement.clientWidth;
        const h = canvas.height = 150;
        ctx.clearRect(0, 0, w, h);

        const maxWpm = Math.max(...data, 10);
        const padX = 20;
        const padY = 20;
        const stepX = (w - padX * 2) / Math.max(data.length - 1, 1);
        
        const isDark = document.body.classList.contains('dark-theme');
        const accent = isDark ? '#22d3ee' : '#0891b2';

        ctx.beginPath();
        ctx.moveTo(padX, h - padY - (data[0] / maxWpm) * (h - padY * 2));
        
        data.forEach((val, i) => {
            const x = padX + i * stepX;
            const y = h - padY - (val / maxWpm) * (h - padY * 2);
            ctx.lineTo(x, y);
        });

        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.lineTo(w - padX, h - padY);
        ctx.lineTo(padX, h - padY);
        ctx.fillStyle = isDark ? 'rgba(34, 211, 238, 0.1)' : 'rgba(8, 145, 178, 0.1)';
        ctx.fill();
    }

    document.getElementById('result-close-btn')?.addEventListener('click', () => {
        resultsModal.classList.add('hidden');
    });

    document.getElementById('result-retry-btn')?.addEventListener('click', () => {
        resultsModal.classList.add('hidden');
        if (state.currentRetryFn) state.currentRetryFn();
    });

    // ----------------------------------------------------
    // 7. Text Databases
    // ----------------------------------------------------
    const practiceTexts = {
        quotes: [
            "The only way to do great work is to love what you do.",
            "Life is what happens when you're busy making other plans.",
            "To be or not to be, that is the question.",
            "I think, therefore I am.",
            "That which does not kill us makes us stronger.",
            "The journey of a thousand miles begins with one step.",
            "Strive not to be a success, but rather to be of value.",
            "The mind is everything. What you think you become.",
            "An unexamined life is not worth living.",
            "Eighty percent of success is showing up.",
            "Your time is limited, so don't waste it living someone else's life.",
            "In three words I can sum up everything I've learned about life: it goes on.",
            "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
            "Happiness is not something ready made. It comes from your own actions.",
            "Be the change that you wish to see in the world."
        ],
        code: [
            "const sum = (a, b) => a + b;",
            "function greet(name) { return `Hello, ${name}!`; }",
            "let items = [1, 2, 3].map(n => n * 2);",
            "for (let i = 0; i < 10; i++) { console.log(i); }",
            "if (user.isAdmin) { grantAccess(); } else { denyAccess(); }",
            "def calculate_area(radius):\n    return 3.14 * radius ** 2",
            "import os\nprint(os.getcwd())",
            "class Node:\n    def __init__(self, data):\n        self.data = data\n        self.next = None",
            "document.getElementById('app').innerHTML = 'Ready';",
            "setTimeout(() => console.log('Done'), 1000);"
        ],
        words: [
            "about", "above", "across", "act", "active", "activity", "add", "afraid", "after", "again", "age", "ago", "agree", "air", "all", "alone", "along", "already", "always", "am", "amount", "an", "and", "angry", "another", "answer", "any", "anyone", "anything", "anytime", "appear", "apple", "are", "area", "arm", "army", "around", "arrive", "art", "as", "ask", "at", "attack", "aunt", "autumn", "away", "baby", "back", "bad", "bag", "ball", "bank", "base", "basket", "bath", "be", "bear", "beautiful", "because", "become", "bed", "bedroom", "beer", "before", "begin", "bell", "below", "beside", "best", "better", "between", "bird", "birth", "birthday", "bit", "bite", "black", "bleed", "block", "blood", "blow", "blue", "board", "boat", "body", "boil", "bone", "book", "border", "born", "borrow", "both", "bottle", "bottom", "bowl", "box", "boy", "branch", "brave", "bread", "break", "breakfast", "breathe", "bridge", "bright", "bring", "brother", "brown", "brush", "build", "burn", "business", "bus", "busy", "but", "buy", "by", "call", "can", "cap", "car", "card", "care", "careful", "careless", "carry", "case", "cat", "catch", "central", "century", "certain", "chair", "chance", "change", "chase", "cheap", "cheese", "chicken", "child", "children", "chocolate", "choice", "choose", "circle", "city", "class", "clever", "clean", "clear", "climb", "clock", "cloth", "clothes", "cloud", "cloudy", "close", "coffee", "coat", "coin", "cold", "collect", "colour", "comb", "come", "comfortable", "common", "compare", "come", "complete", "computer", "condition", "continue", "control", "copper", "corn", "corner", "correct", "cost", "contain", "count", "country", "course", "cover", "crash", "cross", "cry", "cup", "cupboard", "cut", "dance", "danger", "dark", "date", "daughter", "day", "dead", "decide", "decrease", "deep", "deer", "depend", "desk", "destroy", "develop", "die", "different", "difficult", "dinner", "direction", "dirty", "discover", "dish", "do", "dog", "door", "double", "down", "draw", "dream", "dress", "drink", "drive", "drop", "dry", "duck", "dust", "duty", "each", "ear", "early", "earn", "earth", "east", "easy"
        ]
    };

    // ----------------------------------------------------
    // 8. Training Lessons
    // ----------------------------------------------------
    const lessons = [
        { title: 'Lesson 1', desc: 'F and J (home index)', keys: 'fj', text: 'fff jjj fjf jfj ffjj jjff fjfj jfjf fff jjj fj fj' },
        { title: 'Lesson 2', desc: 'D and K', keys: 'fjdk', text: 'ddd kkk dkd kdk ddkk kkdd dkdk kdkd fdf jkj dfj kjd' },
        { title: 'Lesson 3', desc: 'S and L', keys: 'fjdksl', text: 'sss lll sls lsl ssll llss slsl lsls sds lkl sdl kls' },
        { title: 'Lesson 4', desc: 'A and ; (semicolon)', keys: 'fjdksla;', text: 'aaa ;;; a;a ;a; aa;; ;;aa a;a; ;a;a asd ;lk afj ;kj' },
        { title: 'Lesson 5', desc: 'Home Row Master', keys: 'fjdksla;', text: 'asdf jkl; asdf jkl; fdsa ;lkj asdfg hjkl; asdf jkl;' },
        { title: 'Lesson 6', desc: 'E and I (top row middle)', keys: 'fjdksla;ei', text: 'eee iii eie iei ded kik eed iik die kid lie sir' },
        { title: 'Lesson 7', desc: 'R and U (top row index)', keys: 'fjdksla;eiru', text: 'rrr uuu rur uru frf juj rrf uuj fur rug red use' },
        { title: 'Lesson 8', desc: 'T and Y (top row center)', keys: 'fjdksla;eiruty', text: 'ttt yyy tyt yty ftf jyj try yet tie out tea yes' },
        { title: 'Lesson 9', desc: 'W and O (top row ring)', keys: 'fjdksla;eirutywo', text: 'www ooo wow owo sws lol two owl low row won our' },
        { title: 'Lesson 10', desc: 'Q and P (top row pinky)', keys: 'fjdksla;eirutywoqp', text: 'qqq ppp qpq pqp aqa ;p; pro pop quiet put pay' },
        { title: 'Lesson 11', desc: 'G and H (home row center)', keys: 'fjdksla;eirutywoqpgh', text: 'ggg hhh ghg hgh fgf jhj got hot dog hog high go' },
        { title: 'Lesson 12', desc: 'Full Review', keys: 'abcdefghijklmnopqrstuvwxyz;', text: 'the quick brown fox jumps over the lazy dog; practice makes perfect;' }
    ];

    // ----------------------------------------------------
    // 9. Local Topic Database
    // ----------------------------------------------------
    const localTopicDB = {
        'black holes': 'Black holes are regions of spacetime where gravity is so strong that nothing, not even light, can escape. They form when massive stars collapse at the end of their life cycle.',
        'quantum computing': 'Quantum computers use quantum bits or qubits. Unlike classical bits that are 0 or 1, qubits can exist in a superposition of states, allowing complex calculations to be solved exponentially faster.',
        'javascript': 'JavaScript is a high-level, interpreted programming language primarily used for building interactive web pages. It is a core technology of the World Wide Web alongside HTML and CSS.',
        'machine learning': 'Machine learning is a subset of artificial intelligence that involves training algorithms to learn patterns from data and make predictions or decisions without being explicitly programmed.',
        'photosynthesis': 'Photosynthesis is the process used by plants, algae, and certain bacteria to harness energy from sunlight and turn it into chemical energy, converting carbon dioxide and water into glucose and oxygen.',
        'ancient rome': 'Ancient Rome was a thriving civilization that grew from a small town on the Tiber River in central Italy into a massive empire that encompassed much of continental Europe, Britain, much of western Asia, northern Africa and the Mediterranean islands.',
        'blockchain': 'A blockchain is a decentralized, distributed, and public digital ledger that is used to record transactions across many computers so that the record cannot be altered retroactively without the alteration of all subsequent blocks.',
        'climate change': 'Climate change refers to long-term shifts in temperatures and weather patterns. While natural, human activities have been the main driver since the 1800s, primarily due to burning fossil fuels.',
        'python programming': 'Python is a high-level, general-purpose programming language. Its design philosophy emphasizes code readability with the use of significant indentation. Python is dynamically typed and garbage-collected.',
        'neural networks': 'Neural networks are computing systems inspired by the biological neural networks that constitute animal brains. They are based on a collection of connected units or nodes called artificial neurons.',
        'space travel': 'Space exploration is the use of astronomy and space technology to explore outer space. While the exploration of space is carried out mainly by astronomers with telescopes, its physical exploration is conducted both by uncrewed robotic space probes and human spaceflight.',
        'evolution': 'Evolution is change in the heritable characteristics of biological populations over successive generations. These characteristics are the expressions of genes that are passed on from parent to offspring during reproduction.',
        'mathematics': 'Mathematics is an area of knowledge that includes the topics of numbers, formulas and related structures, shapes and the spaces in which they are contained, and quantities and their changes.',
        'world war 2': 'World War II was a global conflict that lasted from 1939 to 1945. It involved the vast majority of the worlds countries forming two opposing military alliances: the Allies and the Axis powers.',
        'ocean life': 'Marine life refers to the plants, animals and other organisms that live in the salt water of the sea or ocean, or the brackish water of coastal estuaries. At a fundamental level, marine life helps determine the very nature of our planet.',
        'renewable energy': 'Renewable energy is energy derived from natural resources that are replenished at a higher rate than they are consumed. Sunlight and wind, for example, are such sources that are constantly being replenished.',
        'artificial intelligence': 'Artificial intelligence is intelligence demonstrated by machines, as opposed to the natural intelligence displayed by animals including humans. AI research has been defined as the field of study of intelligent agents.',
        'human anatomy': 'Human anatomy is the study of the structure of the human body. The human body is composed of multiple interacting systems, including the skeletal, muscular, nervous, endocrine, cardiovascular, and respiratory systems.',
        'philosophy': 'Philosophy is the systematized study of general and fundamental questions, such as those about existence, reason, knowledge, values, mind, and language. Such questions are often posed as problems to be studied or resolved.',
        'cybersecurity': 'Computer security, cybersecurity, or information technology security is the protection of computer systems and networks from information disclosure, theft of or damage to their hardware, software, or electronic data.'
    };

    function getFallbackText(topic) {
        const t = topic.toLowerCase().trim();
        if (localTopicDB[t]) return localTopicDB[t];
        for (const key in localTopicDB) {
            if (key.includes(t) || t.includes(key)) return localTopicDB[key];
        }
        return `${topic} is a fascinating subject that encompasses many intricate details and concepts. Learning about it requires patience and a curious mind. The fundamental principles of this topic have far-reaching implications in various fields of study and everyday life. Mastering the core ideas can provide a solid foundation for more advanced exploration and understanding of complex systems.`;
    }

    // ----------------------------------------------------
    // 10. Tab Navigation
    // ----------------------------------------------------
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    function switchTab(tabName) {
        state.activeTab = tabName;
        navBtns.forEach(btn => {
            if (btn.dataset.tab === tabName) btn.classList.add('active');
            else btn.classList.remove('active');
        });
        tabContents.forEach(content => {
            if (content.id === `tab-${tabName}`) content.classList.add('active');
            else content.classList.remove('active');
        });

        resetKeyboard();

        if (tabName === 'practice') {
            initPracticeTest();
        } else if (tabName === 'training') {
            loadLessons();
            initLesson();
        } else if (tabName === 'stats') {
            renderStats();
        } else if (tabName === 'games') {
            endGame();
            endSprint();
        }
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if(btn.dataset.tab) switchTab(btn.dataset.tab);
        });
    });

    // ----------------------------------------------------
    // 11. Theme Toggle
    // ----------------------------------------------------
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle?.addEventListener('click', () => {
        document.body.classList.toggle('dark-theme');
        document.body.classList.toggle('light-theme');
        const icon = themeToggle.querySelector('i');
        if (document.body.classList.contains('dark-theme')) {
            icon.className = 'fa-solid fa-moon';
        } else {
            icon.className = 'fa-solid fa-sun';
        }
    });

    // ----------------------------------------------------
    // 12. Sound Toggle
    // ----------------------------------------------------
    const soundToggle = document.getElementById('sound-toggle');
    soundToggle?.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        const icon = soundToggle.querySelector('i');
        if (soundEnabled) {
            icon.className = 'fa-solid fa-volume-high';
            showToast('Sound enabled', 'info');
        } else {
            icon.className = 'fa-solid fa-volume-xmark';
            showToast('Sound disabled', 'info');
        }
    });

    // ----------------------------------------------------
    // 13. On-Screen Keyboard Logic
    // ----------------------------------------------------
    const keysMap = {};
    document.querySelectorAll('.keyboard .key').forEach(key => {
        keysMap[key.id] = key;
    });

    function getElementIdForChar(char) {
        if (char === ' ') return 'key-Space';
        if (/[a-zA-Z]/.test(char)) return `key-Key${char.toUpperCase()}`;
        if (/[0-9]/.test(char)) return `key-Digit${char}`;
        const map = {
            ';': 'key-Semicolon', "'": 'key-Quote', ',': 'key-Comma', '.': 'key-Period',
            '/': 'key-Slash', '-': 'key-Minus', '=': 'key-Equal', '`': 'key-Backquote',
            '\\': 'key-Backslash', '[': 'key-BracketLeft', ']': 'key-BracketRight'
        };
        return map[char] || null;
    }

    function highlightKey(code, active) {
        const key = keysMap[code];
        if (key) {
            if (active) key.classList.add('active-key');
            else key.classList.remove('active-key');
        }
    }

    function setNextKeyHighlight(char) {
        document.querySelectorAll('.keyboard .key').forEach(k => k.classList.remove('highlight-next'));
        const id = getElementIdForChar(char);
        if (id && keysMap[id]) {
            keysMap[id].classList.add('highlight-next');
        }
    }

    function resetKeyboard() {
        document.querySelectorAll('.keyboard .key').forEach(k => {
            k.classList.remove('active-key');
            k.classList.remove('highlight-next');
        });
    }

    window.addEventListener('keydown', (e) => {
        highlightKey(e.code, true);
    });
    window.addEventListener('keyup', (e) => {
        highlightKey(e.code, false);
    });

    // ----------------------------------------------------
    // 14. Core Text Renderer
    // ----------------------------------------------------
    function renderText(element, text, currentIndex) {
        if (!element) return;
        element.innerHTML = '';
        for (let i = 0; i < text.length; i++) {
            const span = document.createElement('span');
            span.className = 'letter';
            if (i < currentIndex) span.classList.add('correct');
            if (i === currentIndex) span.classList.add('active');
            span.textContent = text[i] === ' ' ? '\u00A0' : text[i];
            element.appendChild(span);
        }
    }

    // ----------------------------------------------------
    // 15. Practice Mode Logic
    // ----------------------------------------------------
    const textDisplay = document.getElementById('text-display');
    const keyboardInput = document.getElementById('keyboard-input');
    const typingContainer = document.getElementById('typing-container');
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.practice.mode = e.currentTarget.dataset.mode;
            if (e.currentTarget.dataset.val) {
                if (state.practice.mode === 'time') state.practice.timeLimit = parseInt(e.currentTarget.dataset.val);
                else state.practice.wordCount = parseInt(e.currentTarget.dataset.val);
            }
            initPracticeTest();
        });
    });

    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.practice.category = e.currentTarget.dataset.cat;
            initPracticeTest();
        });
    });

    function initPracticeTest() {
        clearInterval(state.practice.timer);
        state.practice.currentIndex = 0;
        state.practice.startTime = null;
        state.practice.errors = 0;
        state.practice.typedKeys = 0;
        state.practice.isActive = false;
        state.practice.wpmHistory = [];

        if (state.practice.mode === 'words') {
            const count = state.practice.wordCount || 25;
            let text = [];
            for(let i=0; i<count; i++) {
                text.push(practiceTexts.words[Math.floor(Math.random() * practiceTexts.words.length)]);
            }
            state.practice.text = text.join(' ');
        } else {
            const pool = practiceTexts[state.practice.category] || practiceTexts.quotes;
            state.practice.text = pool[Math.floor(Math.random() * pool.length)];
        }

        renderText(textDisplay, state.practice.text, state.practice.currentIndex);
        setNextKeyHighlight(state.practice.text[0]);
        state.currentRetryFn = initPracticeTest;

        if (state.practice.mode === 'time') {
            document.getElementById('live-timer').textContent = state.practice.timeLimit;
            document.getElementById('timer-label').textContent = 's';
        } else {
            document.getElementById('live-timer').textContent = `0/${state.practice.text.split(' ').length}`;
            document.getElementById('timer-label').textContent = 'w';
        }
        document.getElementById('live-wpm').textContent = '0';
        document.getElementById('live-acc').textContent = '100%';
        if (keyboardInput) keyboardInput.value = '';
    }

    typingContainer?.addEventListener('click', () => {
        keyboardInput?.focus();
    });

    keyboardInput?.addEventListener('input', (e) => {
        if (!keyboardInput.value) return;
        const char = keyboardInput.value.slice(-1);
        keyboardInput.value = '';
        handlePracticeKeystroke(char);
    });

    function handlePracticeKeystroke(char) {
        if (!state.practice.isActive) {
            state.practice.isActive = true;
            state.practice.startTime = Date.now();
            if (state.practice.mode === 'time') startPracticeTimer();
        }

        state.practice.typedKeys++;
        const targetChar = state.practice.text[state.practice.currentIndex];

        if (char === targetChar) {
            state.practice.currentIndex++;
            playSound(char === ' ' ? 'space' : 'click');
            
            if (state.practice.currentIndex % 5 === 0) {
                const mins = (Date.now() - state.practice.startTime) / 60000;
                const cw = (state.practice.currentIndex) / 5;
                state.practice.wpmHistory.push(Math.round(cw / mins));
            }

            if (state.practice.currentIndex >= state.practice.text.length) {
                completePracticeTest();
                return;
            }
        } else {
            state.practice.errors++;
            playSound('error');
            const spans = textDisplay.querySelectorAll('.letter');
            if (spans[state.practice.currentIndex]) {
                spans[state.practice.currentIndex].classList.add('incorrect');
            }
            return;
        }

        renderText(textDisplay, state.practice.text, state.practice.currentIndex);
        updateLiveStats();
        setNextKeyHighlight(state.practice.text[state.practice.currentIndex]);
    }

    function startPracticeTimer() {
        let timeLeft = state.practice.timeLimit;
        document.getElementById('live-timer').textContent = timeLeft;
        state.practice.timer = setInterval(() => {
            timeLeft--;
            document.getElementById('live-timer').textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(state.practice.timer);
                completePracticeTest();
            }
        }, 1000);
    }

    function updateLiveStats() {
        const mins = (Date.now() - state.practice.startTime) / 60000;
        const wpm = mins > 0 ? Math.round((state.practice.currentIndex / 5) / mins) : 0;
        const acc = state.practice.typedKeys > 0 ? Math.round(((state.practice.typedKeys - state.practice.errors) / state.practice.typedKeys) * 100) : 100;
        
        document.getElementById('live-wpm').textContent = wpm;
        document.getElementById('live-acc').textContent = `${acc}%`;

        if (state.practice.mode === 'words') {
            const wordsTyped = state.practice.text.substring(0, state.practice.currentIndex).split(' ').length - 1;
            const totalWords = state.practice.text.split(' ').length;
            document.getElementById('live-timer').textContent = `${wordsTyped}/${totalWords}`;
        }
    }

    function completePracticeTest() {
        clearInterval(state.practice.timer);
        state.practice.isActive = false;
        
        const timeTaken = (Date.now() - state.practice.startTime) / 1000;
        const mins = timeTaken / 60;
        const wpm = Math.round((state.practice.currentIndex / 5) / mins);
        const rawWpm = Math.round((state.practice.typedKeys / 5) / mins);
        const acc = Math.round(((state.practice.typedKeys - state.practice.errors) / state.practice.typedKeys) * 100);

        const result = {
            mode: state.practice.mode === 'time' ? `Time ${state.practice.timeLimit}s` : `Words ${state.practice.wordCount || 25}`,
            wpm: wpm || 0,
            rawWpm: rawWpm || 0,
            accuracy: acc || 0,
            time: Math.round(timeTaken),
            chars: state.practice.currentIndex,
            errors: state.practice.errors,
            wpmHistory: state.practice.wpmHistory,
            date: new Date().toISOString()
        };

        state.history.push(result);
        localStorage.setItem('ntype_history', JSON.stringify(state.history));

        showResults(result);
        playSound('success');
    }

    document.getElementById('restart-btn')?.addEventListener('click', initPracticeTest);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.activeTab === 'practice') initPracticeTest();
    });


    // ----------------------------------------------------
    // 16. Training Mode Logic
    // ----------------------------------------------------
    const lessonsList = document.getElementById('lessons-list');
    const trainTextDisplay = document.getElementById('train-text-display');
    const trainKeyboardInput = document.getElementById('train-keyboard-input');
    const trainTypingContainer = document.getElementById('train-typing-container');

    function loadLessons() {
        if (!lessonsList) return;
        lessonsList.innerHTML = '';
        lessons.forEach((l, idx) => {
            const div = document.createElement('div');
            div.className = `lesson-item ${idx === state.training.activeLessonIndex ? 'active' : ''} ${state.training.completedLessons.has(idx) ? 'completed' : ''}`;
            
            const info = document.createElement('div');
            info.className = 'lesson-info';
            const h4 = document.createElement('h4');
            h4.textContent = l.title;
            const p = document.createElement('p');
            p.textContent = l.desc;
            info.appendChild(h4);
            info.appendChild(p);

            const badge = document.createElement('div');
            badge.className = 'lesson-badge';
            if (state.training.completedLessons.has(idx)) {
                badge.innerHTML = '<i class="fa-solid fa-check"></i>';
            } else {
                badge.textContent = `${idx + 1}`;
            }

            div.appendChild(info);
            div.appendChild(badge);

            div.addEventListener('click', () => {
                state.training.activeLessonIndex = idx;
                loadLessons();
                initLesson();
            });
            lessonsList.appendChild(div);
        });
    }

    function initLesson() {
        const l = lessons[state.training.activeLessonIndex];
        if (!l) return;
        document.getElementById('lesson-title').textContent = l.title;
        document.getElementById('lesson-subtitle').textContent = l.desc;

        state.training.text = l.text;
        state.training.currentIndex = 0;
        state.training.startTime = null;
        state.training.errors = 0;
        state.training.typedKeys = 0;
        state.training.isActive = false;

        renderText(trainTextDisplay, state.training.text, state.training.currentIndex);
        setNextKeyHighlight(state.training.text[0]);
        updateFingerVisualizer(state.training.text[0]);

        document.getElementById('train-wpm').textContent = '0';
        document.getElementById('train-acc').textContent = '100%';
        document.getElementById('train-progress').textContent = '0%';
        if (trainKeyboardInput) trainKeyboardInput.value = '';
    }

    trainTypingContainer?.addEventListener('click', () => {
        trainKeyboardInput?.focus();
    });

    trainKeyboardInput?.addEventListener('input', (e) => {
        if (!trainKeyboardInput.value) return;
        const char = trainKeyboardInput.value.slice(-1);
        trainKeyboardInput.value = '';
        handleTrainingKeystroke(char);
    });

    function handleTrainingKeystroke(char) {
        if (!state.training.isActive) {
            state.training.isActive = true;
            state.training.startTime = Date.now();
        }

        state.training.typedKeys++;
        const targetChar = state.training.text[state.training.currentIndex];

        if (char === targetChar) {
            state.training.currentIndex++;
            playSound(char === ' ' ? 'space' : 'click');

            if (state.training.currentIndex >= state.training.text.length) {
                state.training.completedLessons.add(state.training.activeLessonIndex);
                localStorage.setItem('ntype_training_progress', JSON.stringify(Array.from(state.training.completedLessons)));
                showToast('Lesson Complete!', 'success');
                playSound('success');
                
                state.training.activeLessonIndex = (state.training.activeLessonIndex + 1) % lessons.length;
                loadLessons();
                initLesson();
                return;
            }
        } else {
            state.training.errors++;
            playSound('error');
            const spans = trainTextDisplay.querySelectorAll('.letter');
            if (spans[state.training.currentIndex]) {
                spans[state.training.currentIndex].classList.add('incorrect');
            }
            return;
        }

        renderText(trainTextDisplay, state.training.text, state.training.currentIndex);
        setNextKeyHighlight(state.training.text[state.training.currentIndex]);
        updateFingerVisualizer(state.training.text[state.training.currentIndex]);

        const mins = (Date.now() - state.training.startTime) / 60000;
        const wpm = mins > 0 ? Math.round((state.training.currentIndex / 5) / mins) : 0;
        const acc = state.training.typedKeys > 0 ? Math.round(((state.training.typedKeys - state.training.errors) / state.training.typedKeys) * 100) : 100;
        const prog = Math.round((state.training.currentIndex / state.training.text.length) * 100);

        document.getElementById('train-wpm').textContent = wpm;
        document.getElementById('train-acc').textContent = `${acc}%`;
        document.getElementById('train-progress').textContent = `${prog}%`;
    }

    function updateFingerVisualizer(char) {
        document.querySelectorAll('.finger').forEach(f => f.classList.remove('active-finger'));
        if (!char) return;
        const c = char.toLowerCase();
        let finger = null;

        if (['a', 'q', 'z', '1'].includes(c)) finger = 'left-pinky';
        else if (['s', 'w', 'x', '2'].includes(c)) finger = 'left-ring';
        else if (['d', 'e', 'c', '3'].includes(c)) finger = 'left-middle';
        else if (['f', 'r', 't', 'g', 'v', 'b', '4', '5'].includes(c)) finger = 'left-index';
        else if (c === ' ') finger = 'left-thumb'; // or right-thumb
        else if (['j', 'u', 'y', 'h', 'n', 'm', '6', '7'].includes(c)) finger = 'right-index';
        else if (['k', 'i', ',', '8'].includes(c)) finger = 'right-middle';
        else if (['l', 'o', '.', '9'].includes(c)) finger = 'right-ring';
        else if ([';', 'p', '/', '0', "'", '[', ']', '\\', '-', '='].includes(c)) finger = 'right-pinky';

        if (finger) {
            const el = document.querySelector(`.finger[data-finger="${finger}"]`);
            if (el) el.classList.add('active-finger');
        }
    }


    // ----------------------------------------------------
    // 17. AI Topic Mode Logic
    // ----------------------------------------------------
    const apiKeyInput = document.getElementById('gemini-api-key');
    if (apiKeyInput) apiKeyInput.value = localStorage.getItem('ntype_gemini_key') || '';

    document.getElementById('save-api-key')?.addEventListener('click', () => {
        localStorage.setItem('ntype_gemini_key', apiKeyInput.value);
        showToast('API Key saved', 'success');
    });

    const aiGenerateBtn = document.getElementById('ai-generate-btn');
    const aiTopicInput = document.getElementById('ai-topic-input');
    const loader = document.getElementById('generation-loader');
    const aiArena = document.getElementById('ai-typing-arena');
    const aiTextDisplay = document.getElementById('ai-text-display');
    const aiKeyboardInput = document.getElementById('ai-keyboard-input');
    const aiTypingContainer = document.getElementById('ai-typing-container');

    aiGenerateBtn?.addEventListener('click', async () => {
        const topic = aiTopicInput.value.trim();
        if (!topic) {
            showToast('Please enter a topic', 'error');
            return;
        }

        loader.classList.remove('hidden');
        aiArena.classList.add('hidden');
        
        const apiKey = localStorage.getItem('ntype_gemini_key');
        let text = '';

        if (apiKey) {
            try {
                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `Write a single educational paragraph about "${topic}" for a typing test. Keep it between 60-80 words. Plain text only, no formatting, no markdown, no special characters, no newlines.` }] }]
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    text = data.candidates[0].content.parts[0].text.replace(/\n/g, ' ').trim();
                } else {
                    throw new Error('API Error');
                }
            } catch (err) {
                console.error(err);
                showToast('API Error, using fallback text', 'error');
                text = getFallbackText(topic);
            }
        } else {
            await new Promise(r => setTimeout(r, 1500));
            text = getFallbackText(topic);
        }

        loader.classList.add('hidden');
        startAITest(topic, text);
    });

    function startAITest(topic, text) {
        aiArena.classList.remove('hidden');
        document.getElementById('ai-arena-topic-title').textContent = topic;

        state.aiTopic = {
            text: text,
            currentIndex: 0,
            startTime: null,
            errors: 0,
            typedKeys: 0,
            isActive: false,
            currentTopic: topic,
            wpmHistory: []
        };
        state.currentRetryFn = () => startAITest(topic, text);

        renderText(aiTextDisplay, text, 0);
        setNextKeyHighlight(text[0]);
        document.getElementById('ai-wpm').textContent = '0';
        document.getElementById('ai-acc').textContent = '100%';
        document.getElementById('ai-progress').textContent = '0%';
        if (aiKeyboardInput) aiKeyboardInput.value = '';
        aiKeyboardInput?.focus();
    }

    aiTypingContainer?.addEventListener('click', () => aiKeyboardInput?.focus());
    
    document.getElementById('ai-close-test')?.addEventListener('click', () => {
        aiArena.classList.add('hidden');
    });

    aiKeyboardInput?.addEventListener('input', (e) => {
        if (!aiKeyboardInput.value) return;
        const char = aiKeyboardInput.value.slice(-1);
        aiKeyboardInput.value = '';
        handleAIKeystroke(char);
    });

    function handleAIKeystroke(char) {
        if (!state.aiTopic.isActive) {
            state.aiTopic.isActive = true;
            state.aiTopic.startTime = Date.now();
        }

        state.aiTopic.typedKeys++;
        const targetChar = state.aiTopic.text[state.aiTopic.currentIndex];

        if (char === targetChar) {
            state.aiTopic.currentIndex++;
            playSound(char === ' ' ? 'space' : 'click');

            if (state.aiTopic.currentIndex % 5 === 0) {
                const mins = (Date.now() - state.aiTopic.startTime) / 60000;
                const cw = (state.aiTopic.currentIndex) / 5;
                state.aiTopic.wpmHistory.push(Math.round(cw / mins));
            }

            if (state.aiTopic.currentIndex >= state.aiTopic.text.length) {
                state.aiTopic.isActive = false;
                const timeTaken = (Date.now() - state.aiTopic.startTime) / 1000;
                const mins = timeTaken / 60;
                const wpm = Math.round((state.aiTopic.currentIndex / 5) / mins);
                const rawWpm = Math.round((state.aiTopic.typedKeys / 5) / mins);
                const acc = Math.round(((state.aiTopic.typedKeys - state.aiTopic.errors) / state.aiTopic.typedKeys) * 100);

                const result = {
                    mode: `AI: ${state.aiTopic.currentTopic}`,
                    wpm: wpm || 0,
                    rawWpm: rawWpm || 0,
                    accuracy: acc || 0,
                    time: Math.round(timeTaken),
                    chars: state.aiTopic.currentIndex,
                    errors: state.aiTopic.errors,
                    wpmHistory: state.aiTopic.wpmHistory,
                    date: new Date().toISOString()
                };
                state.history.push(result);
                localStorage.setItem('ntype_history', JSON.stringify(state.history));
                
                aiArena.classList.add('hidden');
                showResults(result);
                playSound('success');
                return;
            }
        } else {
            state.aiTopic.errors++;
            playSound('error');
            const spans = aiTextDisplay.querySelectorAll('.letter');
            if (spans[state.aiTopic.currentIndex]) {
                spans[state.aiTopic.currentIndex].classList.add('incorrect');
            }
            return;
        }

        renderText(aiTextDisplay, state.aiTopic.text, state.aiTopic.currentIndex);
        setNextKeyHighlight(state.aiTopic.text[state.aiTopic.currentIndex]);

        const mins = (Date.now() - state.aiTopic.startTime) / 60000;
        const wpm = mins > 0 ? Math.round((state.aiTopic.currentIndex / 5) / mins) : 0;
        const acc = state.aiTopic.typedKeys > 0 ? Math.round(((state.aiTopic.typedKeys - state.aiTopic.errors) / state.aiTopic.typedKeys) * 100) : 100;
        const prog = Math.round((state.aiTopic.currentIndex / state.aiTopic.text.length) * 100);

        document.getElementById('ai-wpm').textContent = wpm;
        document.getElementById('ai-acc').textContent = `${acc}%`;
        document.getElementById('ai-progress').textContent = `${prog}%`;
    }

    // ----------------------------------------------------
    // 18. Game 1: Key Laser (Falling Letters)
    // ----------------------------------------------------
    const gameCanvas = document.getElementById('game-canvas');
    const gctx = gameCanvas ? gameCanvas.getContext('2d') : null;
    let gameActive = false;
    let gameScore = 0;
    let gameCombo = 1;
    let gameHealth = 100;
    let fallingLetters = [];
    let laserBeams = [];
    let explosions = [];
    let gameLoopId = null;
    let spawnTimerId = null;
    let baseSpeed = 1.0;
    let gameHighscore = localStorage.getItem('ntype_laser_hs') || 0;

    document.getElementById('game-highscore').textContent = gameHighscore;

    function launchGame() {
        const container = document.getElementById('game-canvas-container');
        if (container) {
            container.classList.remove('hidden');
            container.requestFullscreen().catch(e => console.log('Fullscreen blocked', e));
        }
        const info = container?.closest('.game-card')?.querySelector('.game-info');
        if (info) info.style.display = 'none';
        document.getElementById('game-overlay').classList.add('hidden');
        toggleKeyboard(true);

        gameActive = true;
        gameScore = 0;
        gameCombo = 1;
        gameHealth = 100;
        baseSpeed = 1.0;
        fallingLetters = [];
        laserBeams = [];
        explosions = [];
        
        updateGameUI();
        
        spawnTimerId = setInterval(spawnLetter, 1100);
        gameLoop();
    }

    function spawnLetter() {
        if (!gameActive) return;
        const chars = 'abcdefghijklmnopqrstuvwxyz';
        fallingLetters.push({
            char: chars[Math.floor(Math.random() * chars.length)],
            x: 30 + Math.random() * (gameCanvas.width - 60),
            y: -20,
            speed: baseSpeed + Math.random() * 0.5,
            size: 22,
            alpha: 1
        });
    }

    function updateGameUI() {
        document.getElementById('game-score').textContent = gameScore;
        document.getElementById('game-combo').textContent = `x${gameCombo}`;
        const healthBar = document.getElementById('game-health');
        if (healthBar) {
            healthBar.style.width = `${gameHealth}%`;
            healthBar.style.background = gameHealth > 40 ? 'var(--color-correct)' : 'var(--color-error)';
        }
    }

    window.addEventListener('keypress', (e) => {
        if (!gameActive) return;
        const char = e.key.toLowerCase();
        
        let targetIdx = -1;
        let maxY = -100;
        for (let i = 0; i < fallingLetters.length; i++) {
            if (fallingLetters[i].char === char && fallingLetters[i].y > maxY) {
                maxY = fallingLetters[i].y;
                targetIdx = i;
            }
        }

        if (targetIdx !== -1) {
            const target = fallingLetters[targetIdx];
            
            laserBeams.push({
                startX: gameCanvas.width / 2,
                startY: gameCanvas.height,
                endX: target.x,
                endY: target.y,
                alpha: 1
            });

            for(let i=0; i<12; i++) {
                explosions.push({
                    x: target.x, y: target.y,
                    vx: (Math.random() - 0.5) * 10,
                    vy: (Math.random() - 0.5) * 10,
                    life: 1.0,
                    color: ['#22d3ee', '#f43f5e', '#eab308'][Math.floor(Math.random()*3)]
                });
            }

            fallingLetters.splice(targetIdx, 1);
            playSound(gameCombo >= 5 ? 'combo' : 'click');
            
            gameScore += 10 * gameCombo;
            gameCombo++;
            baseSpeed += 0.015;
            
            if (gameCombo % 10 === 0) showToast(`x${gameCombo} COMBO!`, 'success');
            
            updateGameUI();
        } else {
            playSound('error');
            gameCombo = 1;
            updateGameUI();
        }
    });

    function damageShield() {
        gameHealth -= 12;
        playSound('error');
        gameCombo = 1;
        updateGameUI();
        if (gameHealth <= 0) endGame();
    }

    function endGame() {
        if (!gameActive) return;
        gameActive = false;
        cancelAnimationFrame(gameLoopId);
        clearInterval(spawnTimerId);
        
        document.getElementById('game-overlay').classList.remove('hidden');
        document.getElementById('game-overlay-title').textContent = 'GAME OVER';
        document.getElementById('game-overlay-subtitle').textContent = `Final Score: ${gameScore}`;
        
        toggleKeyboard(false);
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(e => console.log('Exit fullscreen error', e));
        }
        
        if (gameScore > gameHighscore) {
            gameHighscore = gameScore;
            localStorage.setItem('ntype_laser_hs', gameHighscore);
            document.getElementById('game-highscore').textContent = gameHighscore;
        }
        playSound('error');
    }

    function gameLoop() {
        if (!gameActive || !gctx) return;
        gctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        
        // CRT effect
        gctx.fillStyle = '#060810';
        gctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
        gctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
        for(let i=0; i<gameCanvas.height; i+=4) gctx.fillRect(0, i, gameCanvas.width, 1);

        const isDark = document.body.classList.contains('dark-theme');
        const accent = isDark ? '#22d3ee' : '#0891b2';

        for (let i = fallingLetters.length - 1; i >= 0; i--) {
            let l = fallingLetters[i];
            l.y += l.speed;
            
            gctx.beginPath();
            gctx.arc(l.x, l.y, 22, 0, Math.PI*2);
            gctx.fillStyle = isDark ? 'rgba(34, 211, 238, 0.12)' : 'rgba(8, 145, 178, 0.12)';
            gctx.fill();

            gctx.fillStyle = '#ffffff';
            gctx.font = 'bold 22px "JetBrains Mono"';
            gctx.textAlign = 'center';
            gctx.textBaseline = 'middle';
            gctx.fillText(l.char, l.x, l.y);

            if (l.y > gameCanvas.height) {
                fallingLetters.splice(i, 1);
                damageShield();
            }
        }

        for (let i = laserBeams.length - 1; i >= 0; i--) {
            let b = laserBeams[i];
            gctx.beginPath();
            gctx.moveTo(b.startX, b.startY);
            gctx.lineTo(b.endX, b.endY);
            gctx.strokeStyle = `rgba(${isDark ? '34, 211, 238' : '8, 145, 178'}, ${b.alpha})`;
            gctx.lineWidth = 3;
            gctx.stroke();
            
            b.alpha -= 0.12;
            if (b.alpha <= 0) laserBeams.splice(i, 1);
        }

        for (let i = explosions.length - 1; i >= 0; i--) {
            let ex = explosions[i];
            ex.x += ex.vx;
            ex.y += ex.vy;
            ex.life -= 0.05;
            
            gctx.beginPath();
            gctx.arc(ex.x, ex.y, 3, 0, Math.PI*2);
            gctx.fillStyle = ex.color;
            gctx.globalAlpha = ex.life > 0 ? ex.life : 0;
            gctx.fill();
            gctx.globalAlpha = 1.0;

            if (ex.life <= 0) explosions.splice(i, 1);
        }

        gameLoopId = requestAnimationFrame(gameLoop);
    }

    document.getElementById('start-game-btn')?.addEventListener('click', launchGame);
    document.getElementById('game-retry-btn')?.addEventListener('click', launchGame);


    // ----------------------------------------------------
    // 19. Game 2: Word Sprint
    // ----------------------------------------------------
    const sprintCanvas = document.getElementById('sprint-canvas');
    const sctx = sprintCanvas ? sprintCanvas.getContext('2d') : null;
    let sprintActive = false;
    let sprintScore = 0;
    let sprintStreak = 0;
    let sprintTimeLeft = 60;
    let sprintCurrentWord = '';
    let sprintLoopId = null;
    let sprintTimerId = null;
    let sprintHighscore = localStorage.getItem('ntype_sprint_hs') || 0;

    document.getElementById('sprint-highscore').textContent = sprintHighscore;

    function launchSprint() {
        const sprintContainer = document.getElementById('sprint-canvas-container');
        if (sprintContainer) {
            sprintContainer.classList.remove('hidden');
            sprintContainer.requestFullscreen().catch(e => console.log('Fullscreen blocked', e));
        }
        const sprintInfo = sprintContainer?.closest('.game-card')?.querySelector('.game-info');
        if (sprintInfo) sprintInfo.style.display = 'none';
        document.getElementById('sprint-overlay').classList.add('hidden');
        toggleKeyboard(true);

        sprintActive = true;
        sprintScore = 0;
        sprintStreak = 0;
        sprintTimeLeft = 60;
        
        updateSprintUI();
        pickNewWord();
        
        sprintTimerId = setInterval(() => {
            sprintTimeLeft--;
            updateSprintUI();
            if (sprintTimeLeft <= 0) endSprint();
        }, 1000);
        
        sprintRenderLoop();
        document.getElementById('sprint-input').focus();
    }

    function pickNewWord() {
        sprintCurrentWord = practiceTexts.words[Math.floor(Math.random() * practiceTexts.words.length)];
        const input = document.getElementById('sprint-input');
        if (input) input.value = '';
    }

    function updateSprintUI() {
        document.getElementById('sprint-score').textContent = Math.round(sprintScore);
        document.getElementById('sprint-timer').textContent = `${sprintTimeLeft}s`;
        document.getElementById('sprint-streak').textContent = `Streak: ${sprintStreak}`;
    }

    document.getElementById('sprint-input')?.addEventListener('input', (e) => {
        if (!sprintActive) return;
        const val = e.target.value.toLowerCase();
        
        if (val === sprintCurrentWord) {
            sprintScore += sprintCurrentWord.length * (1 + sprintStreak * 0.1);
            sprintStreak++;
            playSound('success');
            
            if (sprintStreak === 5 || sprintStreak === 10 || sprintStreak === 20) {
                showToast(`${sprintStreak} WORD STREAK!`, 'success');
            }
            
            updateSprintUI();
            pickNewWord();
        } else if (val.length > sprintCurrentWord.length) {
            playSound('error');
            sprintStreak = 0;
            e.target.value = '';
            updateSprintUI();
        }
    });

    function endSprint() {
        if (!sprintActive) return;
        sprintActive = false;
        cancelAnimationFrame(sprintLoopId);
        clearInterval(sprintTimerId);
        
        document.getElementById('sprint-overlay').classList.remove('hidden');
        document.getElementById('sprint-overlay-title').textContent = 'TIME UP!';
        document.getElementById('sprint-overlay-subtitle').textContent = `Final Score: ${Math.round(sprintScore)}`;
        
        toggleKeyboard(false);
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(e => console.log('Exit fullscreen error', e));
        }
        
        if (sprintScore > sprintHighscore) {
            sprintHighscore = Math.round(sprintScore);
            localStorage.setItem('ntype_sprint_hs', sprintHighscore);
            document.getElementById('sprint-highscore').textContent = sprintHighscore;
        }
        
        if (sprintScore > 100) playSound('success');
        else playSound('error');
    }

    function sprintRenderLoop() {
        if (!sprintActive || !sctx) return;
        sctx.clearRect(0, 0, sprintCanvas.width, sprintCanvas.height);
        
        const yOffset = Math.sin(Date.now() / 300) * 10;
        const centerX = sprintCanvas.width / 2;
        const centerY = sprintCanvas.height / 2 + yOffset;

        if (sprintStreak >= 5) {
            for(let i=0; i<5; i++) {
                sctx.beginPath();
                sctx.arc(centerX + (Math.random()-0.5)*150, centerY + (Math.random()-0.5)*50, Math.random()*5, 0, Math.PI*2);
                sctx.fillStyle = `rgba(255, 165, 0, ${Math.random()*0.5})`;
                sctx.fill();
            }
        }

        sctx.fillStyle = '#ffffff';
        sctx.font = 'bold 48px "JetBrains Mono"';
        sctx.textAlign = 'center';
        sctx.textBaseline = 'middle';
        sctx.fillText(sprintCurrentWord, centerX, centerY);

        sprintLoopId = requestAnimationFrame(sprintRenderLoop);
    }

    document.getElementById('start-sprint-btn')?.addEventListener('click', launchSprint);
    document.getElementById('sprint-retry-btn')?.addEventListener('click', launchSprint);

    // ----------------------------------------------------
    // 20. Statistics Tab
    // ----------------------------------------------------
    function renderStats() {
        const tbody = document.getElementById('history-tbody');
        const totalEl = document.getElementById('stats-total-tests');
        const avgWpmEl = document.getElementById('stats-avg-wpm');
        const highWpmEl = document.getElementById('stats-high-wpm');
        const avgAccEl = document.getElementById('stats-avg-accuracy');
        const chartCanvas = document.getElementById('stats-chart');

        if (!tbody) return;

        if (state.history.length === 0) {
            totalEl.textContent = '0';
            avgWpmEl.textContent = '0';
            highWpmEl.textContent = '0';
            avgAccEl.textContent = '0%';
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No tests completed yet.</td></tr>';
            if (chartCanvas) {
                const ctx = chartCanvas.getContext('2d');
                ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
            }
            return;
        }

        totalEl.textContent = state.history.length;
        
        let sumWpm = 0;
        let sumAcc = 0;
        let maxWpm = 0;

        tbody.innerHTML = '';
        
        // Reverse history for table
        const reversedHistory = [...state.history].reverse();
        
        reversedHistory.forEach(r => {
            sumWpm += r.wpm;
            sumAcc += r.accuracy;
            if (r.wpm > maxWpm) maxWpm = r.wpm;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(r.date).toLocaleDateString()} ${new Date(r.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                <td>${r.mode}</td>
                <td>${r.wpm}</td>
                <td>${r.accuracy}%</td>
                <td>${r.time}s</td>
            `;
            tbody.appendChild(tr);
        });

        avgWpmEl.textContent = Math.round(sumWpm / state.history.length);
        highWpmEl.textContent = maxWpm;
        avgAccEl.textContent = `${Math.round(sumAcc / state.history.length)}%`;

        // Chart for last 20 tests
        if (chartCanvas) {
            const recent = state.history.slice(-20).map(r => r.wpm);
            drawChart(chartCanvas, recent);
        }
    }

    document.getElementById('clear-stats-btn')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all history? This cannot be undone.')) {
            state.history = [];
            localStorage.removeItem('ntype_history');
            renderStats();
            showToast('History cleared', 'info');
        }
    });

    // ----------------------------------------------------
    // 21. Initialization
    // ----------------------------------------------------
    switchTab('training');
    
    // Set proper heights and initial state
    resizeBgCanvas();
    resizeConfetti();

});
