function adjustValue(controlId, delta) {
    const input = document.getElementById(controlId);
    const newValue = Math.max(
        parseInt(input.min),
        Math.min(parseInt(input.max), parseInt(input.value) + delta)
    );
    input.value = newValue;
    document.getElementById(controlId + 'Value').textContent = newValue;
    // Trigger the input event to update the simulation
    input.dispatchEvent(new Event('input'));
}

class SandSound {
    constructor() {
        this.audioCtx = null;
        this.noiseSource = null;
        this.gainNode = null;
        this.filterNode = null;
        this.lfo = null;
        this.lfoGain = null;
        this.isPlaying = false;
        this.targetVolume = 0.03; // Lower volume for softer sound
        this.fadeDuration = 1.0; // seconds (quicker fade out)
        this.muted = false;
    }
    start() {
        if (this.isPlaying || this.muted) return;
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const bufferSize = 2 * this.audioCtx.sampleRate;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            // Slightly more granular noise
            data[i] = (Math.random() * 2 - 1) * 0.22 * (0.8 + 0.2 * Math.random());
        }
        this.noiseSource = this.audioCtx.createBufferSource();
        this.noiseSource.buffer = buffer;
        this.noiseSource.loop = true;

        // Bandpass filter for sand-like sound
        this.filterNode = this.audioCtx.createBiquadFilter();
        this.filterNode.type = 'bandpass';
        this.filterNode.frequency.value = 900; // Center frequency in Hz
        this.filterNode.Q.value = 1.2; // Quality factor

        // LFO for filter frequency variation
        this.lfo = this.audioCtx.createOscillator();
        this.lfo.type = 'sine';
        this.lfo.frequency.value = 0.7 + Math.random() * 0.5; // 0.7-1.2 Hz
        this.lfoGain = this.audioCtx.createGain();
        this.lfoGain.gain.value = 180 + Math.random() * 40; // Modulation depth in Hz
        this.lfo.connect(this.lfoGain).connect(this.filterNode.frequency);
        this.lfo.start();

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = this.targetVolume; // No fade in, set immediately
        this.noiseSource.connect(this.filterNode).connect(this.gainNode).connect(this.audioCtx.destination);
        this.noiseSource.start();
        this.isPlaying = true;
    }
    stop() {
        if (this.gainNode && this.isPlaying) {
            const ctx = this.audioCtx;
            this.gainNode.gain.cancelScheduledValues(ctx.currentTime);
            this.gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + this.fadeDuration);
            // Stop and cleanup after fade
            setTimeout(() => {
                if (this.noiseSource) {
                    this.noiseSource.stop();
                    this.noiseSource.disconnect();
                    this.noiseSource = null;
                }
                if (this.filterNode) {
                    this.filterNode.disconnect();
                    this.filterNode = null;
                }
                if (this.lfo) {
                    this.lfo.stop();
                    this.lfo.disconnect();
                    this.lfo = null;
                }
                if (this.lfoGain) {
                    this.lfoGain.disconnect();
                    this.lfoGain = null;
                }
                if (this.gainNode) {
                    this.gainNode.disconnect();
                    this.gainNode = null;
                }
                this.isPlaying = false;
            }, this.fadeDuration * 1000 + 50);
        } else {
            // If not playing, just cleanup
            if (this.noiseSource) {
                this.noiseSource.stop();
                this.noiseSource.disconnect();
                this.noiseSource = null;
            }
            if (this.filterNode) {
                this.filterNode.disconnect();
                this.filterNode = null;
            }
            if (this.lfo) {
                this.lfo.stop();
                this.lfo.disconnect();
                this.lfo = null;
            }
            if (this.lfoGain) {
                this.lfoGain.disconnect();
                this.lfoGain = null;
            }
            if (this.gainNode) {
                this.gainNode.disconnect();
                this.gainNode = null;
            }
            this.isPlaying = false;
        }
    }
    setMuted(mute) {
        this.muted = mute;
        if (mute) {
            this.stop();
        }
    }
}

class SandSimulator {
    constructor() {
        this.canvas = document.getElementById('sandCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.renderScale = 0.35; // Lower rendering resolution for better performance
        this.offscreen = document.createElement('canvas');
        this.offscreenCtx = this.offscreen.getContext('2d');
        this.isPouring = false;
        this.mouseX = 0;
        this.mouseY = 0;
        this.cursorSize = 32;
        this.spawnRate = 5;
        this.particleSize = 7;
        this.gravity = 4;
        this.maxParticles = 10000;
        this.grid = [];
        this.gridWidth = 0;
        this.gridHeight = 0;
        this.bgColor = '#9e9e9e'; // Default background color set to white
        this.sandColor = '#e2c275';
        this.windEnabled = false;
        this.windDir = 0; // 0: none, -1: left, 1: right
        this.sandRGBCycle = false;
        this.sandSound = new SandSound();
        this.soundStopTimeout = null; // For debouncing sound stop
        this.currentTool = 'sand'; // 'sand', 'hollowSquare', 'hollowCircle', 'pencil', 'eraser', 'stick'
        this.isDrawingShape = false;
        this.shapeStart = null;
        this.shapeEnd = null;
        this.wallColor = '#444';
        this.isBlending = false;
        this.isErasing = false;
        this.stickLength = 8; // Length of stick in grid cells
        this.stickWidth = 2;  // Width of stick in grid cells
        this.penColor = '#444444';
        this.lastPenPos = null;
        this.isMixing = false;
        this.lastMixMouse = null;
        this.sandPalette = null;
        this.sandPaletteIndex = 0;

        this.init();
        this.setupEventListeners();
        this.setupControls();
        this.setupMenu();
        this.setupAbout();
        this.setupColorPickers();
        this.setupClearButton();
        this.setupWindButton();
        this.setupShare();
        this.animate();
    }

    init() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.offscreen.width = Math.floor(this.canvas.width * this.renderScale);
        this.offscreen.height = Math.floor(this.canvas.height * this.renderScale);
        this.gridWidth = Math.floor(this.canvas.width / this.particleSize);
        this.gridHeight = Math.floor(this.canvas.height / this.particleSize);
        this.grid = Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(null));
    }

    setupEventListeners() {
        window.addEventListener('resize', () => this.init());
        
        this.canvas.addEventListener('mousedown', (e) => {
            this.updateMousePosition(e);
            if (this.currentTool === 'sand') {
                this.isPouring = true;
                this.canvas.style.cursor = 'url("assets/pour.png") 16 16, pointer';
            } else if (this.currentTool === 'hollowSquare' || this.currentTool === 'hollowCircle') {
                this.isDrawingShape = true;
                this.shapeStart = { x: this.mouseX, y: this.mouseY };
                this.shapeEnd = { x: this.mouseX, y: this.mouseY };
                this.isPouring = false;
            } else if (this.currentTool === 'pencil') {
                this.isDrawingSolidSand = true;
                this.drawSolidSandAtCursor();
            } else if (this.currentTool === 'eraser') {
                this.isErasing = true;
                this.eraseAtCursor();
            } else if (this.currentTool === 'mix') {
                this.isMixing = true;
                this.lastMixMouse = { x: this.mouseX, y: this.mouseY };
                this.mixAtCursor(0, 0); // No force on initial click
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            const prevX = this.mouseX;
            const prevY = this.mouseY;
            this.updateMousePosition(e);
            if (this.isDrawingShape && (this.currentTool === 'hollowSquare' || this.currentTool === 'hollowCircle')) {
                this.shapeEnd = { x: this.mouseX, y: this.mouseY };
            } else if (this.currentTool === 'pencil' && this.isDrawingSolidSand) {
                this.drawSolidSandAtCursor();
            } else if (this.currentTool === 'eraser' && this.isErasing) {
                this.eraseAtCursor();
            } else if (this.currentTool === 'mix' && this.isMixing) {
                if (this.lastMixMouse) {
                    const dx = this.mouseX - this.lastMixMouse.x;
                    const dy = this.mouseY - this.lastMixMouse.y;
                    this.mixAtCursor(dx, dy);
                    this.lastMixMouse = { x: this.mouseX, y: this.mouseY };
                }
            }
        });

        this.canvas.addEventListener('mouseup', () => {
            if (this.currentTool === 'sand') {
                this.isPouring = false;
                this.canvas.style.cursor = 'crosshair';
            } else if (this.isDrawingShape && (this.currentTool === 'hollowSquare' || this.currentTool === 'hollowCircle')) {
                this.commitShapeToGrid();
                this.isDrawingShape = false;
                this.shapeStart = null;
                this.shapeEnd = null;
                this.isPouring = false;
            } else if (this.currentTool === 'pencil') {
                this.isDrawingSolidSand = false;
                this.lastPenPos = null;
            } else if (this.currentTool === 'eraser') {
                this.isErasing = false;
            } else if (this.currentTool === 'mix') {
                this.isMixing = false;
                this.lastMixMouse = null;
            }
        });

        this.canvas.addEventListener('mouseleave', () => {
            if (this.currentTool === 'sand') {
                this.isPouring = false;
                this.canvas.style.cursor = 'crosshair';
            } else if (this.isDrawingShape) {
                this.isDrawingShape = false;
                this.shapeStart = null;
                this.shapeEnd = null;
                this.isPouring = false;
            } else if (this.currentTool === 'pencil') {
                this.isDrawingSolidSand = false;
                this.lastPenPos = null;
            } else if (this.currentTool === 'eraser') {
                this.isErasing = false;
            } else if (this.currentTool === 'mix') {
                this.isMixing = false;
                this.lastMixMouse = null;
            }
        });

        // Mouse wheel for cursor size (works for mix tool too)
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.deltaY < 0) {
                this.cursorSize = Math.min(this.cursorSize + 2, 50);
            } else {
                this.cursorSize = Math.max(this.cursorSize - 2, 5);
            }
            document.getElementById('cursorSize').value = this.cursorSize;
            document.getElementById('cursorSizeValue').textContent = this.cursorSize;
        }, { passive: false });

        // Tool button events
        document.getElementById('hollowSquareBtn').addEventListener('click', () => {
            this.currentTool = 'hollowSquare';
            this.isPouring = false;
            this.updateToolButtonStates();
        });
        document.getElementById('hollowCircleBtn').addEventListener('click', () => {
            this.currentTool = 'hollowCircle';
            this.isPouring = false;
            this.updateToolButtonStates();
        });
        document.getElementById('pencilBtn').addEventListener('click', () => {
            // Toggle between solid sand pen and sand
            if (this.currentTool === 'pencil') {
                this.currentTool = 'sand';
            } else {
                this.currentTool = 'pencil';
            }
            this.isPouring = false;
            this.isDrawingSolidSand = false;
            this.updateToolButtonStates();
        });
        document.getElementById('eraserBtn').addEventListener('click', () => {
            // Toggle between eraser and sand
            if (this.currentTool === 'eraser') {
                this.currentTool = 'sand';
            } else {
                this.currentTool = 'eraser';
            }
            this.isPouring = false;
            this.isErasing = false;
            this.updateToolButtonStates();
        });
        document.getElementById('mixBtn').addEventListener('click', () => {
            // Toggle between mix and sand
            if (this.currentTool === 'mix') {
                this.currentTool = 'sand';
            } else {
                this.currentTool = 'mix';
            }
            this.isPouring = false;
            this.isMixing = false;
            this.lastMixMouse = null;
            this.updateToolButtonStates();
        });

        // Add canvas click handler back for non-eraser tools
        this.canvas.addEventListener('click', () => {
            // Only switch back to sand if current tool is not eraser or pencil
            if (this.currentTool !== 'eraser' && this.currentTool !== 'sand' && this.currentTool !== 'pencil') {
                this.currentTool = 'sand';
                this.isPouring = false;
                this.isDrawingSolidSand = false;
                this.isErasing = false;
                this.updateToolButtonStates();
            }
        });

        // Add right-click handler to switch back to sand mode
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (this.currentTool === 'pencil') {
                this.currentTool = 'sand';
                this.isBlending = false;
                this.updateToolButtonStates();
            }
        });

        // Sand color picker logic
        const sandColorBtn = document.getElementById('sandColorBtn');
        const sandColorPicker = document.getElementById('sandColorPicker');
        if (sandColorBtn && sandColorPicker) {
            let sandColorPickerHideTimeout = null;
            let sandColorPickerHover = false;
            let sandColorBtnHover = false;
            const showSandColorPicker = () => {
                const rect = sandColorBtn.getBoundingClientRect();
                sandColorPicker.style.left = (rect.right + 5) + 'px';
                sandColorPicker.style.top = rect.top + 'px';
                sandColorPicker.style.display = 'block';
                sandColorPicker.value = this.sandColor;
                if (sandColorPickerHideTimeout) {
                    clearTimeout(sandColorPickerHideTimeout);
                    sandColorPickerHideTimeout = null;
                }
            };
            const tryHideSandColorPicker = () => {
                if (!sandColorPickerHover && !sandColorBtnHover) {
                    sandColorPickerHideTimeout = setTimeout(() => {
                        sandColorPicker.style.display = 'none';
                        sandColorPickerHideTimeout = null;
                    }, 400);
                }
            };
            sandColorBtn.addEventListener('mouseenter', () => {
                sandColorBtnHover = true;
                showSandColorPicker();
            });
            sandColorBtn.addEventListener('mouseleave', () => {
                sandColorBtnHover = false;
                tryHideSandColorPicker();
            });
            sandColorPicker.addEventListener('mouseenter', () => {
                sandColorPickerHover = true;
                if (sandColorPickerHideTimeout) {
                    clearTimeout(sandColorPickerHideTimeout);
                    sandColorPickerHideTimeout = null;
                }
            });
            sandColorPicker.addEventListener('mouseleave', () => {
                sandColorPickerHover = false;
                tryHideSandColorPicker();
            });
            sandColorPicker.addEventListener('input', (e) => {
                this.sandColor = e.target.value;
                paletteActive = false;
                this.sandPalette = null;
                paletteBtn.classList.remove('is-primary');
                paletteDropdown.style.display = 'none';
            });
        }

        // Colorful Sand toggle logic
        const paletteBtn = document.getElementById('paletteBtn');
        const paletteDropdown = document.getElementById('paletteDropdown');
        let paletteActive = false;
        const palettes = {
            sunset: ['#ffb347', '#ffcc33', '#ff6666', '#ff9966', '#ff5e62'],
            ocean: ['#00b4d8', '#48cae4', '#90e0ef', '#0077b6', '#03045e'],
            pastel: ['#ffd6e0', '#f7bad3', '#b5ead7', '#c7ceea', '#ffdac1'],
            mono: ['#e2c275', '#bfa76f', '#a68b5b', '#8c7347', '#6e5a36'],
            neon: ['#39ff14', '#faff00', '#ff073a', '#00f0ff', '#ff61f6']
        };

        // Initialize default sand color
        this.sandColor = '#e2c275';
        
        paletteBtn.addEventListener('click', () => {
            paletteActive = !paletteActive;
            if (paletteActive) {
                paletteBtn.classList.add('is-primary');
                paletteDropdown.style.display = 'block';
                // Ensure the dropdown is positioned correctly relative to the button
                const buttonRect = paletteBtn.getBoundingClientRect();
                const dropdownRect = paletteDropdown.getBoundingClientRect();
                // Adjust vertical position if dropdown would go above viewport
                if (buttonRect.top - dropdownRect.height < 0) {
                    paletteDropdown.style.bottom = 'auto';
                    paletteDropdown.style.top = '0';
                }
                const selectedPalette = paletteDropdown.value || 'sunset';
                this.sandPalette = palettes[selectedPalette];
                this.sandPaletteIndex = 0;
            } else {
                paletteBtn.classList.remove('is-primary');
                paletteDropdown.style.display = 'none';
                this.sandPalette = null;
                // Make sure we have a valid sand color to fall back to
                if (!this.sandColor || this.sandColor === '') {
                    this.sandColor = '#e2c275';
                }
            }
        });

        paletteDropdown.addEventListener('change', (e) => {
            if (paletteActive) {
                this.sandPalette = palettes[e.target.value];
                this.sandPaletteIndex = 0;
            }
        });

        // Sidebar sand color picker
        const sidebarSandColorPicker = document.getElementById('sandColor');
        if (sidebarSandColorPicker) {
            sidebarSandColorPicker.addEventListener('input', (e) => {
                this.sandColor = e.target.value;
                paletteActive = false;
                this.sandPalette = null;
                paletteBtn.classList.remove('is-primary');
                paletteDropdown.style.display = 'none';
            });
        }

        // Shape and pen color picker logic
        const shapeColorBtn = document.getElementById('hollowSquareBtn');
        const circleColorBtn = document.getElementById('hollowCircleBtn');
        const pencilColorBtn = document.getElementById('pencilBtn');
        const shapeColorPicker = document.getElementById('shapeColorPicker');
        const penColorPicker = document.getElementById('penColorPicker');

        // Setup color picker for shape tools and pen
        const setupColorPicker = (button, picker, colorProperty) => {
            let hideTimeout = null;
            let pickerHover = false;
            let buttonHover = false;
            const showPicker = () => {
                const rect = button.getBoundingClientRect();
                picker.style.left = (rect.right + 5) + 'px';
                picker.style.top = rect.top + 'px';
                picker.style.display = 'block';
                picker.value = this[colorProperty];
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
            };
            const tryHidePicker = () => {
                if (!pickerHover && !buttonHover) {
                    hideTimeout = setTimeout(() => {
                        picker.style.display = 'none';
                        hideTimeout = null;
                    }, 400);
                }
            };
            button.addEventListener('mouseenter', () => {
                buttonHover = true;
                showPicker();
            });
            button.addEventListener('mouseleave', () => {
                buttonHover = false;
                tryHidePicker();
            });
            picker.addEventListener('mouseenter', () => {
                pickerHover = true;
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
            });
            picker.addEventListener('mouseleave', () => {
                pickerHover = false;
                tryHidePicker();
            });
            picker.addEventListener('input', (e) => {
                this[colorProperty] = e.target.value;
            });
        };

        // Setup color pickers for both shape buttons and pen
        if (shapeColorBtn && shapeColorPicker) {
            setupColorPicker(shapeColorBtn, shapeColorPicker, 'wallColor');
            setupColorPicker(circleColorBtn, shapeColorPicker, 'wallColor');
        }
        if (pencilColorBtn && penColorPicker) {
            setupColorPicker(pencilColorBtn, penColorPicker, 'penColor');
        }
    }

    setupMenu() {
        const menuIcon = document.getElementById('menuIcon');
        const sidebar = document.getElementById('sidebar');
        menuIcon.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
        // Optional: close sidebar when clicking outside or pressing Escape
        document.addEventListener('mousedown', (e) => {
            if (sidebar.classList.contains('active') && !sidebar.contains(e.target) && !menuIcon.contains(e.target)) {
                sidebar.classList.remove('active');
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
            }
        });
    }

    setupAbout() {
        const aboutIcon = document.getElementById('aboutIcon');
        const aboutModal = document.getElementById('aboutModal');
        const aboutCloseBtn = document.getElementById('aboutCloseBtn');
        
        aboutIcon.addEventListener('click', () => {
            aboutModal.style.display = 'flex';
        });
        
        aboutCloseBtn.addEventListener('click', () => {
            aboutModal.style.display = 'none';
        });
        
        // Close modal when clicking backdrop
        aboutModal.addEventListener('click', (e) => {
            if (e.target === aboutModal) {
                aboutModal.style.display = 'none';
            }
        });
        
        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && aboutModal.style.display === 'flex') {
                aboutModal.style.display = 'none';
            }
        });
    }

    setupControls() {
        const cursorSizeSlider = document.getElementById('cursorSize');
        const spawnRateSlider = document.getElementById('spawnRate');
        const particleSizeSlider = document.getElementById('particleSize');
        const gravitySlider = document.getElementById('gravity');
        const sandRGB = document.getElementById('sandRGB');
        cursorSizeSlider.addEventListener('input', (e) => {
            this.cursorSize = parseInt(e.target.value);
            document.getElementById('cursorSizeValue').textContent = this.cursorSize;
        });

        spawnRateSlider.addEventListener('input', (e) => {
            this.spawnRate = parseInt(e.target.value);
            document.getElementById('spawnRateValue').textContent = this.spawnRate;
        });

        particleSizeSlider.addEventListener('input', (e) => {
            showCustomModal({
                message: 'Changing particle size will cause current work to erase. Continue?',
                fgColor: '#fff',
                bgColor: '#c0392b',
                okText: 'Yes',
                cancelText: 'No',
                onOk: () => {
                    this.particleSize = parseInt(e.target.value);
                    document.getElementById('particleSizeValue').textContent = this.particleSize;
                    this.init();
                },
                onCancel: () => {
                    particleSizeSlider.value = this.particleSize;
                }
            });
        });

        gravitySlider.addEventListener('input', (e) => {
            this.gravity = parseInt(e.target.value);
            document.getElementById('gravityValue').textContent = this.gravity;
        });

        sandRGB.addEventListener('change', (e) => {
            this.sandRGBCycle = e.target.checked;
        });

        // Set initial gravity value
        this.gravity = parseInt(gravitySlider.value);
        document.getElementById('gravityValue').textContent = this.gravity;
    }

    setupColorPickers() {
        const bgColorInput = document.getElementById('bgColor');
        const sandColorInput = document.getElementById('sandColor');
        const sidebar = document.getElementById('sidebar');
        const menuIcon = document.getElementById('menuIcon');
        bgColorInput.addEventListener('input', (e) => {
            this.bgColor = e.target.value;
            const inv = this.invertColor(this.bgColor);
            sidebar.style.color = inv;
            // Change menu icon bar color
            Array.from(menuIcon.children).forEach(bar => bar.style.background = inv);
        });
        sandColorInput.addEventListener('input', (e) => {
            this.sandColor = e.target.value;
        });
        // Set initial menu/sidebar color
        const inv = this.invertColor(this.bgColor);
        sidebar.style.color = inv;
        Array.from(menuIcon.children).forEach(bar => bar.style.background = inv);
    }

    setupClearButton() {
        const clearBtn = document.getElementById('clearBtn');
        clearBtn.addEventListener('click', () => {
            showCustomModal({
                message: 'Are you sure to Clear Canvas?',
                fgColor: '#fff',
                bgColor: '#c0392b',
                okText: 'Clear',
                cancelText: 'Cancel',
                onOk: () => {
                    this.grid = Array.from({ length: this.gridHeight }, () => Array(this.gridWidth).fill(null));
                }
            });
        });
    }

    setupWindButton() {
        const windBtn = document.getElementById('windBtn');
        windBtn.addEventListener('click', () => {
            this.windEnabled = !this.windEnabled;
            windBtn.classList.toggle('active', this.windEnabled);
            // Randomize wind direction each time it's enabled
            if (this.windEnabled) {
                this.windDir = Math.random() < 0.5 ? -1 : 1;
            }
        });
    }

    setupShare() {
        const shareIcon = document.getElementById('shareIcon');
        const shareModal = document.getElementById('shareModal');
        const shareCloseBtn = document.getElementById('shareCloseBtn');
        const sharePreviewImg = document.getElementById('sharePreviewImg');
        const shareDownload = document.getElementById('shareDownload');
        const shareImageBtn = document.getElementById('shareImageBtn');
        const canvas = document.getElementById('sandCanvas');

        // Hide Share Image button if not supported
        if (!navigator.canShare || !navigator.canShare({ files: [new File([new Blob()], 'x.png', {type:'image/png'})] })) {
            shareImageBtn.style.display = 'none';
        }

        shareIcon.addEventListener('click', () => {
            // Capture screenshot of canvas only
            canvas.toBlob(blob => {
                const dataUrl = canvas.toDataURL('image/png');
                sharePreviewImg.src = dataUrl;
                shareDownload.href = dataUrl;

                // Web Share API (if supported)
                if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'sand-canvas.png', {type:'image/png'})] })) {
                    shareImageBtn.onclick = async () => {
                        try {
                            await navigator.share({
                                files: [new File([blob], 'sand-canvas.png', {type:'image/png'})],
                                title: 'Sand Canvas',
                                text: 'Hey Look At my Sandart made using sandcanvas'
                            });
                        } catch (err) {
                            // User cancelled or error
                        }
                    };
                }
            }, 'image/png');
            shareModal.style.display = 'flex';
        });

        shareCloseBtn.addEventListener('click', () => {
            shareModal.style.display = 'none';
        });
        // Close modal when clicking backdrop
        shareModal.addEventListener('click', (e) => {
            if (e.target === shareModal) {
                shareModal.style.display = 'none';
            }
        });
        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && shareModal.style.display === 'flex') {
                shareModal.style.display = 'none';
            }
        });
    }

    // Helper to invert a hex color
    invertColor(hex) {
        let c = hex.substring(1);
        if (c.length === 3) c = c[0]+c[0]+c[1]+c[1]+c[2]+c[2];
        const num = parseInt(c, 16);
        const r = 255 - (num >> 16 & 0xFF);
        const g = 255 - (num >> 8 & 0xFF);
        const b = 255 - (num & 0xFF);
        return `rgb(${r},${g},${b})`;
    }

    updateMousePosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouseX = e.clientX - rect.left;
        this.mouseY = e.clientY - rect.top;
        
        // Update cursor based on current tool
        if (this.currentTool === 'eraser') {
            this.canvas.style.cursor = 'url("assets/eraser.svg") 16 16, pointer';
        } else if (this.currentTool === 'pencil') {
            this.canvas.style.cursor = 'url("assets/pencil.png") 16 16, pointer';
        } else if (this.currentTool === 'sand' && this.isPouring) {
            this.canvas.style.cursor = 'url("assets/pour.png") 16 16, pointer';
        } else {
            this.canvas.style.cursor = 'crosshair';
        }
    }

    hexToHSL(H) {
        // Convert hex to RGB first
        let r = 0, g = 0, b = 0;
        if (H.length == 4) {
            r = "0x" + H[1] + H[1];
            g = "0x" + H[2] + H[2];
            b = "0x" + H[3] + H[3];
        } else if (H.length == 7) {
            r = "0x" + H[1] + H[2];
            g = "0x" + H[3] + H[4];
            b = "0x" + H[5] + H[6];
        }
        r /= 255;
        g /= 255;
        b /= 255;
        let cmin = Math.min(r, g, b),
            cmax = Math.max(r, g, b),
            delta = cmax - cmin,
            h = 0,
            s = 0,
            l = 0;
        if (delta == 0)
            h = 0;
        else if (cmax == r)
            h = ((g - b) / delta) % 6;
        else if (cmax == g)
            h = (b - r) / delta + 2;
        else
            h = (r - g) / delta + 4;
        h = Math.round(h * 60);
        if (h < 0)
            h += 360;
        l = (cmax + cmin) / 2;
        s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
        s = +(s * 100).toFixed(1);
        l = +(l * 100).toFixed(1);
        return { h, s, l };
    }

    // Helper to interpolate between two HSL colors
    interpolateHSL(hsl1, hsl2, factor) {
        // Ensure shortest path for hue interpolation
        let h1 = hsl1.h;
        let h2 = hsl2.h;
        let diff = h2 - h1;
        
        // Adjust for hue wrap-around
        if (diff > 180) h1 += 360;
        else if (diff < -180) h2 += 360;
        
        // Interpolate
        const h = (h1 + (h2 - h1) * factor) % 360;
        const s = hsl1.s + (hsl2.s - hsl1.s) * factor;
        const l = hsl1.l + (hsl2.l - hsl1.l) * factor;
        
        return { h, s, l };
    }

    // Get smoothly interpolated palette color
    getPaletteColor() {
        if (!this.sandPalette || this.sandPalette.length === 0) return this.sandColor;
        
        // Calculate the position in the palette cycle (0 to 1)
        const totalColors = this.sandPalette.length;
        // Slow down the cycle by using a larger divisor
        const position = (this.sandPaletteIndex % (totalColors * 200)) / 200;
        const index = Math.floor(position);
        const nextIndex = (index + 1) % totalColors;
        const factor = position - index;
        
        // Convert hex colors to HSL
        const currentColor = this.hexToHSL(this.sandPalette[index]);
        const nextColor = this.hexToHSL(this.sandPalette[nextIndex]);
        
        // Add slight randomness to the interpolation factor for more natural blending
        const randomFactor = factor + (Math.random() - 0.5) * 0.1;
        const clampedFactor = Math.max(0, Math.min(1, randomFactor));
        
        // Interpolate between colors with broader spectrum
        const interpolated = this.interpolateHSL(currentColor, nextColor, clampedFactor);
        
        // Add slight variation to saturation and lightness
        const s = Math.max(0, Math.min(100, interpolated.s + (Math.random() - 0.5) * 5));
        const l = Math.max(0, Math.min(100, interpolated.l + (Math.random() - 0.5) * 3));
        
        return `hsl(${interpolated.h}, ${s}%, ${l}%)`;
    }

    addParticles() {
        for (let i = 0; i < this.spawnRate; i++) {
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * this.cursorSize;
            const px = Math.floor((this.mouseX + Math.cos(angle) * radius) / this.particleSize);
            const py = Math.floor((this.mouseY + Math.sin(angle) * radius) / this.particleSize);
            if (
                px >= 0 && px < this.gridWidth &&
                py >= 0 && py < this.gridHeight &&
                this.grid[py][px] === null
            ) {
                let color;
                if (this.sandPalette && this.sandPalette.length > 0) {
                    color = this.getPaletteColor();
                    this.sandPaletteIndex++;
                } else if (this.sandRGBCycle) {
                    // Cycle hue over time for RGB effect
                    const now = Date.now();
                    const baseHue = (now / 10) % 360;
                    const hueNoise = (Math.random() - 0.5) * 16;
                    const h = (baseHue + hueNoise + 360) % 360;
                    const l = 50 + (Math.random() - 0.5) * 8;
                    color = `hsl(${h}, 100%, ${l}%)`;
                } else {
                    // Enhanced grain effect: random hue shift up to ±8
                    const baseColor = this.sandColor;
                    const hsl = this.hexToHSL(baseColor);
                    const hueNoise = (Math.random() - 0.5) * 16; // -8 to +8
                    hsl.h = (hsl.h + hueNoise + 360) % 360;
                    // Add a little random lightness for more grain
                    hsl.l = Math.max(30, Math.min(90, hsl.l + (Math.random() - 0.5) * 8));
                    color = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
                }
                this.grid[py][px] = {
                    color: color
                };
            }
        }
    }

    updateParticles() {
        let anyParticlesMoved = false;
        // Gravity: number of update steps per frame
        for (let g = 0; g < this.gravity; g++) {
            for (let y = this.gridHeight - 2; y >= 0; y--) {
                for (let x = 0; x < this.gridWidth; x++) {
                    const p = this.grid[y][x];
                    // Skip solid (wall) particles for performance
                    if (!p || p.wall) continue;
                    let moved = false;
                    
                    // Wind effect: try to move horizontally if wind is enabled
                    if (this.windEnabled && Math.random() < 0.3) {
                        let wx = x + this.windDir;
                        if (wx >= 0 && wx < this.gridWidth && this.grid[y][wx] === null) {
                            this.grid[y][wx] = p;
                            this.grid[y][x] = null;
                            moved = true;
                            anyParticlesMoved = true;
                            continue;
                        }
                    }

                    // Check if particle can fall straight down
                    if (!moved && this.grid[y + 1][x] === null) {
                        this.grid[y + 1][x] = p;
                        this.grid[y][x] = null;
                        moved = true;
                        anyParticlesMoved = true;
                    } else if (this.grid[y + 1][x] && !this.grid[y + 1][x].wall) {
                        // If blocked by another particle, try to slide
                        const leftPossible = x > 0 && this.grid[y + 1][x - 1] === null;
                        const rightPossible = x < this.gridWidth - 1 && this.grid[y + 1][x + 1] === null;
                        
                        if (leftPossible && rightPossible) {
                            // If both directions possible, choose random
                            const dir = Math.random() < 0.5 ? -1 : 1;
                            this.grid[y + 1][x + dir] = p;
                            this.grid[y][x] = null;
                            moved = true;
                            anyParticlesMoved = true;
                        } else if (leftPossible) {
                            this.grid[y + 1][x - 1] = p;
                            this.grid[y][x] = null;
                            moved = true;
                            anyParticlesMoved = true;
                        } else if (rightPossible) {
                            this.grid[y + 1][x + 1] = p;
                            this.grid[y][x] = null;
                            moved = true;
                            anyParticlesMoved = true;
                        } else {
                            // If can't move down or diagonally, try to slide horizontally along surface
                            const isOnSlope = (x > 0 && this.grid[y + 1][x - 1] && this.grid[y + 1][x - 1].wall) ||
                                            (x < this.gridWidth - 1 && this.grid[y + 1][x + 1] && this.grid[y + 1][x + 1].wall);
                            
                            if (isOnSlope) {
                                const leftSlide = x > 0 && this.grid[y][x - 1] === null;
                                const rightSlide = x < this.gridWidth - 1 && this.grid[y][x + 1] === null;
                                
                                if (leftSlide && rightSlide) {
                                    const dir = Math.random() < 0.5 ? -1 : 1;
                                    this.grid[y][x + dir] = p;
                                    this.grid[y][x] = null;
                                    moved = true;
                                    anyParticlesMoved = true;
                                } else if (leftSlide) {
                                    this.grid[y][x - 1] = p;
                                    this.grid[y][x] = null;
                                    moved = true;
                                    anyParticlesMoved = true;
                                } else if (rightSlide) {
                                    this.grid[y][x + 1] = p;
                                    this.grid[y][x] = null;
                                    moved = true;
                                    anyParticlesMoved = true;
                                }
                            }
                        }
                    }
                }
            }
        }
        return anyParticlesMoved;
    }

    hasParticlesFlowing() {
        // Track the last few frames of particle movement
        if (!this.flowHistory) this.flowHistory = [false, false, false];
        
        // Update history with current frame's movement state
        const currentFrameMovement = this.updateParticles();
        this.flowHistory.shift();
        this.flowHistory.push(currentFrameMovement);
        
        // Only return true if we've seen movement in any of the last few frames
        return this.flowHistory.some(frame => frame);
    }

    draw() {
        // Draw to offscreen buffer
        const ctx = this.offscreenCtx;
        ctx.clearRect(0, 0, this.offscreen.width, this.offscreen.height);
        ctx.fillStyle = this.bgColor;
        ctx.fillRect(0, 0, this.offscreen.width, this.offscreen.height);
        const scale = this.renderScale;
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const p = this.grid[y][x];
                if (p) {
                    ctx.fillStyle = p.color;
                    ctx.fillRect(
                        x * this.particleSize * scale,
                        y * this.particleSize * scale,
                        this.particleSize * scale,
                        this.particleSize * scale
                    );
                }
            }

        }
        // Draw cursor circle when pouring, erasing, or using pencil (on main canvas for sharpness)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(this.offscreen, 0, 0, this.canvas.width, this.canvas.height);
        if (this.isPouring || this.isErasing || this.currentTool === 'pencil' || this.currentTool === 'mix') {
            let color = '#ffffff';
            if (this.isErasing) color = '#ff0000';
            else if (this.currentTool === 'pencil') color = '#e76e55';
            else if (this.currentTool === 'mix') color = '#e76e55';
            this.ctx.strokeStyle = color;
            this.ctx.beginPath();
            this.ctx.arc(this.mouseX, this.mouseY, this.cursorSize, 0, Math.PI * 2);
            this.ctx.stroke();
        }
        // Draw shape preview if drawing (on main canvas for sharpness)
        if (this.isDrawingShape && this.shapeStart && this.shapeEnd) {
            this.ctx.save();
            this.ctx.globalAlpha = 0.5;
            this.ctx.strokeStyle = this.wallColor;
            this.ctx.fillStyle = this.wallColor;
            const x0 = this.shapeStart.x;
            const y0 = this.shapeStart.y;
            const x1 = this.shapeEnd.x;
            const y1 = this.shapeEnd.y;
            if (this.currentTool === 'hollowSquare') {
                const left = Math.min(x0, x1);
                const top = Math.min(y0, y1);
                const width = Math.abs(x1 - x0);
                const height = Math.abs(y1 - y0);
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(left, top, width, height);
            } else if (this.currentTool === 'hollowCircle') {
                const cx = (x0 + x1) / 2;
                const cy = (y0 + y1) / 2;
                const rx = Math.abs(x1 - x0) / 2;
                const ry = Math.abs(y1 - y0) / 2;
                this.ctx.lineWidth = 1.2; // thinner border
                this.ctx.beginPath();
                this.ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }
    }

    animate() {
        // Only play sound if sand is actually moving and gravity is on
        const isFlowing = this.hasParticlesFlowing();
        if (this.currentTool === 'sand' && this.gravity > 0 && isFlowing) {
            if (this.soundStopTimeout) {
                clearTimeout(this.soundStopTimeout);
                this.soundStopTimeout = null;
            }
            if (!this.sandSound.isPlaying && !this.sandSound.muted) {
                if (this.sandSound.audioCtx && this.sandSound.audioCtx.state === 'suspended') {
                    this.sandSound.audioCtx.resume();
                }
                this.sandSound.start();
            }
        } else {
            if (!this.soundStopTimeout && this.sandSound.isPlaying) {
                this.soundStopTimeout = setTimeout(() => {
                    this.sandSound.stop();
                    this.soundStopTimeout = null;
                }, 200);
            }
        }
        
        if (this.isPouring) {
            this.addParticles();
        }
        this.draw();
        requestAnimationFrame(() => this.animate());
    }

    commitShapeToGrid() {
        if (!this.shapeStart || !this.shapeEnd) return;
        const x0 = Math.floor(Math.min(this.shapeStart.x, this.shapeEnd.x) / this.particleSize);
        const y0 = Math.floor(Math.min(this.shapeStart.y, this.shapeEnd.y) / this.particleSize);
        const x1 = Math.floor(Math.max(this.shapeStart.x, this.shapeEnd.x) / this.particleSize);
        const y1 = Math.floor(Math.max(this.shapeStart.y, this.shapeEnd.y) / this.particleSize);
        if (this.currentTool === 'hollowSquare') {
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                        if (y === y0 || y === y1 || x === x0 || x === x1) {
                            this.grid[y][x] = { wall: true, color: this.wallColor };
                        }
                    }
                }
            }
        } else if (this.currentTool === 'hollowCircle') {
            const cx = (x0 + x1) / 2;
            const cy = (y0 + y1) / 2;
            const rx = (x1 - x0) / 2;
            const ry = (y1 - y0) / 2;
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const dx = (x - cx) / (rx || 1);
                    const dy = (y - cy) / (ry || 1);
                    const dist = dx * dx + dy * dy;
                    if (dist <= 1 && dist >= 0.92) { // thinner border
                        if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                            this.grid[y][x] = { wall: true, color: this.wallColor, material: 'circle' };
                        }
                    }
                }
            }
        }
    }

    drawSolidSandAtCursor() {
        const radius = Math.floor(this.cursorSize / this.particleSize);
        const cx = Math.floor(this.mouseX / this.particleSize);
        const cy = Math.floor(this.mouseY / this.particleSize);
        // Interpolate from lastPenPos to current
        if (this.lastPenPos) {
            const x0 = this.lastPenPos.x;
            const y0 = this.lastPenPos.y;
            const x1 = cx;
            const y1 = cy;
            const dist = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
            for (let t = 0; t <= 1; t += 1 / dist) {
                const ix = Math.round(x0 + (x1 - x0) * t);
                const iy = Math.round(y0 + (y1 - y0) * t);
                for (let dy = -radius; dy <= radius; dy++) {
                    for (let dx = -radius; dx <= radius; dx++) {
                        const x = ix + dx;
                        const y = iy + dy;
                        if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                            if (dx * dx + dy * dy <= radius * radius) {
                                this.grid[y][x] = { wall: true, color: this.penColor };
                            }
                        }
                    }
                }
            }
        } else {
            for (let dy = -radius; dy <= radius; dy++) {
                for (let dx = -radius; dx <= radius; dx++) {
                    const x = cx + dx;
                    const y = cy + dy;
                    if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                        if (dx * dx + dy * dy <= radius * radius) {
                            this.grid[y][x] = { wall: true, color: this.penColor };
                        }
                    }
                }
            }
        }
        this.lastPenPos = { x: cx, y: cy };
    }

    eraseAtCursor() {
        const radius = this.cursorSize;
        const radiusSquared = radius * radius;

        // Convert cursor position to grid coordinates
        const cursorGridX = Math.floor(this.mouseX / this.particleSize);
        const cursorGridY = Math.floor(this.mouseY / this.particleSize);

        // Calculate grid-space radius
        const gridRadius = Math.ceil(radius / this.particleSize);

        // Iterate over grid cells in a square around the cursor
        for (let dy = -gridRadius; dy <= gridRadius; dy++) {
            for (let dx = -gridRadius; dx <= gridRadius; dx++) {
                const gridX = cursorGridX + dx;
                const gridY = cursorGridY + dy;

                // Check if the grid position is valid
                if (gridX >= 0 && gridX < this.gridWidth && gridY >= 0 && gridY < this.gridHeight) {
                    // Calculate distance from cursor in screen space
                    const screenX = gridX * this.particleSize + this.particleSize / 2;
                    const screenY = gridY * this.particleSize + this.particleSize / 2;
                    const dx = screenX - this.mouseX;
                    const dy = screenY - this.mouseY;
                    const distanceSquared = dx * dx + dy * dy;

                    // If within the circular radius, erase the cell
                    if (distanceSquared <= radiusSquared) {
                        this.grid[gridY][gridX] = null;
                    }
                }
            }
        }
    }

    updateToolButtonStates() {
        // Remove active state from all tool buttons
        const toolButtons = document.querySelectorAll('.tool-buttons .nes-btn');
        toolButtons.forEach(btn => {
            btn.classList.remove('is-primary');
            btn.style.background = '#fff';
        });
        // Show active state for eraser
        if (this.currentTool === 'eraser') {
            const eraserBtn = document.getElementById('eraserBtn');
            eraserBtn.classList.add('is-primary');
            eraserBtn.style.background = '#e76e55';
        }
        // Show active state for solid sand pen
        if (this.currentTool === 'pencil') {
            const pencilBtn = document.getElementById('pencilBtn');
            pencilBtn.classList.add('is-primary');
            pencilBtn.style.background = '#e76e55';
        }
        if (this.currentTool === 'mix') {
            const mixBtn = document.getElementById('mixBtn');
            mixBtn.classList.add('is-primary');
            mixBtn.style.background = '#e76e55';
        }
    }

    // Mixing logic: move sand particles near the cursor in the direction of mouse movement, with increased force
    mixAtCursor(dx, dy) {
        // Only move if there is a significant movement
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        const radius = Math.floor(this.cursorSize / this.particleSize);
        const cx = Math.floor(this.mouseX / this.particleSize);
        const cy = Math.floor(this.mouseY / this.particleSize);
        // Normalize direction
        let len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return;
        let fx = Math.round(dx / len);
        let fy = Math.round(dy / len);
        // If no direction, do nothing
        if (fx === 0 && fy === 0) return;
        // Increase force: move sand multiple steps in the direction
        const forceSteps = Math.max(2, Math.round(len / this.particleSize) * 2); // More force
        for (let dyy = -radius; dyy <= radius; dyy++) {
            for (let dxx = -radius; dxx <= radius; dxx++) {
                const x = cx + dxx;
                const y = cy + dyy;
                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    if (dxx * dxx + dyy * dyy <= radius * radius) {
                        let px = x;
                        let py = y;
                        let p = this.grid[py][px];
                        if (p && !p.wall) {
                            for (let step = 0; step < forceSteps; step++) {
                                const nx = px + fx;
                                const ny = py + fy;
                                if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight && !this.grid[ny][nx]) {
                                    this.grid[ny][nx] = p;
                                    this.grid[py][px] = null;
                                    px = nx;
                                    py = ny;
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// Initialize the simulator when the page loads
window.addEventListener('load', () => {
    // Start loading animation with realistic variable progress
    const loadingBarFill = document.getElementById('loadingBarFill');
    let progress = 0;
    
    const loadingInterval = setInterval(() => {
        // Variable speed: faster at start, slower in middle, faster at end
        let increment;
        if (progress < 30) {
            increment = 3 + Math.random() * 2; // Fast start: 3-5%
        } else if (progress < 70) {
            increment = 1 + Math.random() * 1.5; // Slower middle: 1-2.5%
        } else {
            increment = 2.5 + Math.random() * 3; // Fast finish: 2.5-5.5%
        }
        
        progress += increment;
        if (progress > 100) progress = 100;
        
        if (loadingBarFill) {
            loadingBarFill.style.width = progress + '%';
        }
        
        if (progress >= 100) {
            clearInterval(loadingInterval);
            
            // Fade out loading screen
            setTimeout(() => {
                const overlay = document.getElementById('loadingOverlay');
                if (overlay) {
                    overlay.classList.add('fade-out');
                    setTimeout(() => {
                        overlay.style.display = 'none';
                    }, 600);
                }
            }, 300);
        }
    }, 30); // 30ms intervals for smoother animation
    
    // Initialize sand simulator
    window.sandSimulatorInstance = new SandSimulator();
});

// Modal utility
function showCustomModal({message, onOk, onCancel, fgColor, bgColor, okText = 'OK', cancelText = 'Cancel'}) {
    const modal = document.getElementById('customModal');
    const msg = document.getElementById('customModalMessage');
    const okBtn = document.getElementById('modalOkBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');
    const content = document.getElementById('customModalContent');
    msg.textContent = message;
    okBtn.textContent = okText;
    cancelBtn.textContent = cancelText;
    // Set colors
    content.style.setProperty('--modal-fg', fgColor || '#fff');
    content.style.setProperty('--modal-bg', bgColor || '#222');
    modal.style.display = 'flex';
    function cleanup() {
        modal.style.display = 'none';
        okBtn.onclick = null;
        cancelBtn.onclick = null;
    }
    okBtn.onclick = () => { cleanup(); if (onOk) onOk(); };
    cancelBtn.onclick = () => { cleanup(); if (onCancel) onCancel(); };
}

// Screenshot button functionality
window.addEventListener('DOMContentLoaded', () => {
    const screenshotBtn = document.getElementById('screenshotBtn');
    const canvas = document.getElementById('sandCanvas');
    if (screenshotBtn && canvas) {
        screenshotBtn.addEventListener('click', () => {
            // Temporarily hide sidebar and tool buttons if visible
            const sidebar = document.getElementById('sidebar');
            const menuBar = document.getElementById('menuBar');
            const toolBtns = document.querySelector('.tool-buttons');
            const prevSidebarDisplay = sidebar ? sidebar.style.display : '';
            const prevMenuBarDisplay = menuBar ? menuBar.style.display : '';
            const prevToolBtnsDisplay = toolBtns ? toolBtns.style.display : '';
            if (sidebar) sidebar.style.display = 'none';
            if (menuBar) menuBar.style.display = 'none';
            if (toolBtns) toolBtns.style.display = 'none';
            // Give the browser a moment to repaint
            setTimeout(() => {
                const dataURL = canvas.toDataURL('image/jpeg', 0.95);
                const link = document.createElement('a');
                link.href = dataURL;
                link.download = 'sand-simulator-screenshot.jpg';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                // Restore UI
                if (sidebar) sidebar.style.display = prevSidebarDisplay;
                if (menuBar) menuBar.style.display = prevMenuBarDisplay;
                if (toolBtns) toolBtns.style.display = prevToolBtnsDisplay;
            }, 100);
        });
    }
});

// Mute/unmute button logic
window.addEventListener('DOMContentLoaded', () => {
    const muteBtn = document.getElementById('muteBtn');
    const muteIcon = document.getElementById('muteIcon');
    let sandSim = null;
    // Wait for SandSimulator instance
    setTimeout(() => {
        sandSim = window.sandSimulatorInstance;
        if (!sandSim) return;
        if (muteBtn && muteIcon) {
            const updateIcon = () => {
                if (sandSim.sandSound.muted) {
                    muteIcon.className = 'nes-icon close is-small';
                    muteIcon.title = 'Unmute';
                } else {
                    muteIcon.className = 'nes-icon speaker is-small';
                    muteIcon.title = 'Mute';
                }
            };
            muteBtn.addEventListener('click', () => {
                sandSim.sandSound.setMuted(!sandSim.sandSound.muted);
                updateIcon();
            });
            updateIcon();
        }
    }, 200);
});

// Mute/unmute button logic for new soundBtn and soundIcon
window.addEventListener('DOMContentLoaded', () => {
    const soundBtn = document.getElementById('soundBtn');
    const soundIcon = document.getElementById('soundIcon');
    let sandSim = null;
    setTimeout(() => {
        sandSim = window.sandSimulatorInstance;
        if (!sandSim) return;
        let soundOn = !sandSim.sandSound.muted;
        const updateIcon = () => {
            soundIcon.src = soundOn ? 'assets/unmute.svg' : 'assets/mute.svg';
            soundIcon.alt = soundOn ? 'Sound' : 'Muted';
        };
        if (soundBtn && soundIcon) {
            soundBtn.addEventListener('click', () => {
                soundOn = !soundOn;
                sandSim.sandSound.setMuted(!soundOn);
                updateIcon();
            });
            updateIcon();
        }
    }, 200);
});

// Custom pixel tooltip for tool buttons and top bar icons
window.addEventListener('DOMContentLoaded', () => {
    // Custom pixel tooltip for tool buttons and top bar icons
    const tooltipTargets = document.querySelectorAll('.tool-buttons .nes-btn[title], .menu-bar[title], .about-bar[title], .share-bar[title]');
    let tooltipEl = null;
    let tooltipTimeout = null;

    tooltipTargets.forEach(btn => {
        btn.addEventListener('mouseenter', (e) => {
            const title = btn.getAttribute('title');
            if (!title) return;
            btn.setAttribute('data-original-title', title);
            btn.removeAttribute('title'); // Prevent default browser tooltip
            tooltipTimeout = setTimeout(() => {
                tooltipEl = document.createElement('div');
                tooltipEl.className = 'pixel-tooltip';
                tooltipEl.textContent = title;
                document.body.appendChild(tooltipEl);
                // Position tooltip near the button
                const rect = btn.getBoundingClientRect();
                let top = rect.top + window.scrollY - tooltipEl.offsetHeight - 8;
                let left = rect.left + window.scrollX + rect.width / 2 - tooltipEl.offsetWidth / 2;
                // Prevent off-screen top
                if (top < window.scrollY + 2) {
                    top = rect.bottom + window.scrollY + 8;
                }
                // Prevent off-screen left
                if (left < window.scrollX + 2) {
                    left = window.scrollX + 2;
                }
                // Prevent off-screen right
                const maxLeft = window.scrollX + window.innerWidth - tooltipEl.offsetWidth - 2;
                if (left > maxLeft) {
                    left = maxLeft;
                }
                tooltipEl.style.top = `${top}px`;
                tooltipEl.style.left = `${left}px`;
            }, 120); // Small delay for polish
        });
        btn.addEventListener('mouseleave', (e) => {
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout);
                tooltipTimeout = null;
            }
            if (tooltipEl) {
                tooltipEl.remove();
                tooltipEl = null;
            }
            // Restore title attribute for accessibility
            const orig = btn.getAttribute('data-original-title');
            if (orig) {
                btn.setAttribute('title', orig);
                btn.removeAttribute('data-original-title');
            }
        });
    });
});

window.addEventListener('DOMContentLoaded', () => {
    const gravityToggleBtn = document.getElementById('gravityToggleBtn');
    const gravityToggleIcon = document.getElementById('gravityToggleIcon');
    let sandSim = null;
    let prevGravity = 4; // Default gravity is now 4
    setTimeout(() => {
        sandSim = window.sandSimulatorInstance;
        if (!sandSim) return;
        prevGravity = sandSim.gravity;
        const updateGravityIcon = () => {
            if (sandSim.gravity === 0) {
                gravityToggleIcon.src = 'assets/pause.svg';
                gravityToggleIcon.alt = 'Gravity Off';
                gravityToggleBtn.setAttribute('data-original-title', 'Gravity Off');
            } else {
                gravityToggleIcon.src = 'assets/play.svg';
                gravityToggleIcon.alt = 'Gravity On';
                gravityToggleBtn.setAttribute('data-original-title', 'Gravity On');
            }
        };
        gravityToggleBtn.addEventListener('click', () => {
            if (sandSim.gravity === 0) {
                sandSim.gravity = prevGravity || 4;
            } else {
                prevGravity = sandSim.gravity;
                sandSim.gravity = 0;
            }
            document.getElementById('gravity').value = sandSim.gravity;
            document.getElementById('gravityValue').textContent = sandSim.gravity;
            updateGravityIcon();
        });
        // Update tooltip on hover to reflect current state
        gravityToggleBtn.addEventListener('mouseenter', () => {
            updateGravityIcon();
        });
        updateGravityIcon();
    }, 200);
});

