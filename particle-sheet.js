/**
 * Interactive 3D Particle Sheet
 * Self-contained canvas component rendering an active, interactive 3D particle terrain.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('particle-sheet');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Grid dimensions
  var COLS = 120;
  var ROWS = 68;

  // 3D World Bounds
  var X_MIN = -700;
  var X_MAX = 700;
  var Z_MIN = 130;
  var Z_MAX = 760;

  // Mountain parameters (matching the reference topology)
  var PEAK_X = 45;
  var PEAK_Z = 410;

  // Camera settings
  var CAM_Y = 175;
  var CAM_Z = -40;
  var BASE_PITCH = 0.23;
  var FOV = 680;

  // State
  var width = 0;
  var height = 0;
  var dpr = 1;
  var isVisible = true;
  var animFrameId = null;

  var pitch = BASE_PITCH;
  var yaw = 0;
  var targetPitch = BASE_PITCH;
  var targetYaw = 0;

  var mouseX = 0;
  var mouseY = 0;
  var mouseWorldX = 0;
  var mouseWorldZ = 0;
  var isHovered = false;
  var hoverStrength = 0;

  var ripples = [];

  // Precomputed color lookup table (256 entries) matching the reference screenshot:
  // Crest / Peak: Warm coral & terracotta (#e0825c, #f09f74)
  // Mid: Dusty rose & copper (#ad6852) -> Mauve/Violet (#785573)
  // Base / Plain: Deep violet & indigo (#514a7c, #37384e)
  var COLOR_KEYPOINTS = [
    { t: 0.00, r: 52,  g: 54,  b: 76  },
    { t: 0.22, r: 76,  g: 72,  b: 122 },
    { t: 0.42, r: 118, g: 82,  b: 112 },
    { t: 0.62, r: 170, g: 102, b: 82  },
    { t: 0.82, r: 220, g: 126, b: 86  },
    { t: 1.00, r: 242, g: 162, b: 118 }
  ];

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  var COLOR_LUT = [];
  for (var i = 0; i < 256; i++) {
    var t = i / 255;
    for (var k = 0; k < COLOR_KEYPOINTS.length - 1; k++) {
      var kp0 = COLOR_KEYPOINTS[k];
      var kp1 = COLOR_KEYPOINTS[k + 1];
      if (t >= kp0.t && t <= kp1.t) {
        var lt = (t - kp0.t) / (kp1.t - kp0.t);
        var r = Math.round(lerp(kp0.r, kp1.r, lt));
        var g = Math.round(lerp(kp0.g, kp1.g, lt));
        var b = Math.round(lerp(kp0.b, kp1.b, lt));
        COLOR_LUT.push('rgb(' + r + ',' + g + ',' + b + ')');
        break;
      }
    }
  }

  // Pre-generate grid (X, Z) base positions
  var grid = [];
  for (var r = ROWS - 1; r >= 0; r--) {
    var zRatio = r / (ROWS - 1);
    var z = Z_MIN + zRatio * (Z_MAX - Z_MIN);
    for (var c = 0; c < COLS; c++) {
      var xRatio = c / (COLS - 1);
      var x = X_MIN + xRatio * (X_MAX - X_MIN);
      grid.push({
        x: x,
        z: z,
        xRatio: xRatio,
        zRatio: zRatio
      });
    }
  }

  // Elevation function: mountain geometry + wave harmonics + interactive physics
  function getElevation(x, z, time) {
    var dx = x - PEAK_X;
    var dz = z - PEAK_Z;

    // Asymmetric rotated coordinate frame for the natural mountain ridge
    var cosAng = 0.9759;
    var sinAng = -0.2181;
    var rx = dx * cosAng - dz * sinAng;
    var rz = dx * sinAng + dz * cosAng;

    var sx = rx < 0 ? 100 : 175;
    var sz = 130;
    var hill = 175 * Math.exp(-0.5 * ((rx / sx) * (rx / sx) + (rz / sz) * (rz / sz)));

    // Right-side shoulder extension (matching the screenshot's warm ridge line)
    var dxSh = x - 170;
    var dzSh = z - 370;
    var sh = 65 * Math.exp(-0.5 * ((dxSh / 120) * (dxSh / 120) + (dzSh / 100) * (dzSh / 100)));

    // Left flank gentle falloff
    var dxLf = x + 160;
    var dzLf = z - 420;
    var lf = 35 * Math.exp(-0.5 * ((dxLf / 110) * (dxLf / 110) + (dzLf / 90) * (dzLf / 90)));

    // Multi-frequency traveling ambient waves
    var w1 = 9.0 * Math.sin(x * 0.012 + time * 1.3) * Math.cos(z * 0.010 + time * 0.85);
    var w2 = 5.5 * Math.sin((x + z) * 0.016 - time * 1.1);
    var w3 = 3.5 * Math.cos((x * 0.022 - z * 0.014) + time * 0.7);

    var y = hill + sh + lf + w1 + w2 + w3;

    // Interactive cursor displacement (wave ripple around pointer)
    if (hoverStrength > 0.01) {
      var dmx = x - mouseWorldX;
      var dmz = z - mouseWorldZ;
      var dist = Math.sqrt(dmx * dmx + dmz * dmz);
      if (dist < 180) {
        var falloff = Math.cos((dist / 180) * (Math.PI * 0.5));
        var ripple = Math.sin(dist * 0.08 - time * 4.5) * 18 * falloff * falloff;
        y += ripple * hoverStrength;
      }
    }

    // Dynamic click/tap shockwaves
    for (var i = 0; i < ripples.length; i++) {
      var rip = ripples[i];
      var rdx = x - rip.x;
      var rdz = z - rip.z;
      var rdist = Math.sqrt(rdx * rdx + rdz * rdz);
      var waveDist = Math.abs(rdist - rip.radius);
      if (waveDist < 70) {
        var wFactor = (1 - waveDist / 70);
        y += Math.sin((rdist - rip.radius) * 0.12) * rip.strength * wFactor;
      }
    }

    return y;
  }

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }

  // Mouse / Touch Interaction
  function onPointerMove(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var relX = clientX - rect.left;
    var relY = clientY - rect.top;

    mouseX = relX;
    mouseY = relY;

    // Smooth camera parallax target
    var nx = (relX / width) - 0.5;
    var ny = (relY / height) - 0.5;
    targetYaw = nx * 0.16;
    targetPitch = BASE_PITCH + ny * 0.10;

    // Project approximate cursor position onto terrain ground plane
    mouseWorldX = nx * 900;
    mouseWorldZ = 220 + (1 - relY / height) * 450;
    isHovered = true;
  }

  function onPointerLeave() {
    isHovered = false;
    targetPitch = BASE_PITCH;
    targetYaw = 0;
  }

  function addRipple(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    var nx = ((clientX - rect.left) / width) - 0.5;
    var ny = ((clientY - rect.top) / height);
    var rx = nx * 900;
    var rz = 220 + (1 - ny) * 450;
    ripples.push({
      x: rx,
      z: rz,
      radius: 0,
      strength: 32,
      maxRadius: 400
    });
  }

  canvas.addEventListener('mousemove', function (e) {
    onPointerMove(e.clientX, e.clientY);
  });

  canvas.addEventListener('mouseleave', onPointerLeave);

  canvas.addEventListener('click', function (e) {
    addRipple(e.clientX, e.clientY);
  });

  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length > 0) {
      var t = e.touches[0];
      onPointerMove(t.clientX, t.clientY);
      addRipple(t.clientX, t.clientY);
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length > 0) {
      var t = e.touches[0];
      onPointerMove(t.clientX, t.clientY);
    }
  }, { passive: true });

  canvas.addEventListener('touchend', onPointerLeave);

  // Animation & Render Loop
  var lastTime = performance.now();

  function render(now) {
    if (!isVisible) return;

    var dt = (now - lastTime) * 0.001;
    lastTime = now;
    var time = now * 0.001;

    // Smooth camera damping
    pitch += (targetPitch - pitch) * 0.06;
    yaw += (targetYaw - yaw) * 0.06;

    // Smooth hover transition
    var targetHover = isHovered ? 1 : 0;
    hoverStrength += (targetHover - hoverStrength) * 0.08;

    // Update ripples
    for (var i = ripples.length - 1; i >= 0; i--) {
      var rip = ripples[i];
      rip.radius += 240 * dt;
      rip.strength *= Math.pow(0.28, dt);
      if (rip.strength < 0.5 || rip.radius > rip.maxRadius) {
        ripples.splice(i, 1);
      }
    }

    // Prepare canvas
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    var centerX = width * 0.5;
    var centerY = height * 0.44;

    var cosP = Math.cos(pitch);
    var sinP = Math.sin(pitch);
    var cosY = Math.cos(yaw);
    var sinY = Math.sin(yaw);

    // Responsive scaling based on viewport width
    var baseFov = FOV * Math.min(1.15, Math.max(0.65, width / 1400));

    // Render particles back to front (grid is pre-sorted from Z_MAX to Z_MIN)
    for (var j = 0; j < grid.length; j++) {
      var pt = grid[j];
      var y = getElevation(pt.x, pt.z, time);

      // Camera space translation
      var dx = pt.x;
      var dy = y - CAM_Y;
      var dz = pt.z - CAM_Z;

      // Yaw rotation (around camera Y)
      var xRot = dx * cosY + dz * sinY;
      var zRot = -dx * sinY + dz * cosY;

      // Pitch rotation (around camera X)
      var yCam = dy * cosP + zRot * sinP;
      var zCam = -dy * sinP + zRot * cosP;

      if (zCam <= 12) continue;

      var scale = baseFov / zCam;
      var sx = centerX + xRot * scale;
      var sy = centerY - yCam * scale;

      // Visibility bounds check with margin
      if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 20) continue;

      // Height normalization (0 = valley, 1 = crest of peak)
      var normH = Math.max(0, Math.min(1, (y - 5) / 215));
      var lutIdx = Math.floor(normH * 255);
      var color = COLOR_LUT[lutIdx] || COLOR_LUT[0];

      // Depth and edge alpha attenuation (matches the dark atmospheric vignette)
      var zFade = 0.35 + 0.65 * (1.0 - pt.zRatio * 0.55);
      var edgeFadeX = Math.min(1, Math.min(sx / (width * 0.12), (width - sx) / (width * 0.12)));
      var edgeFadeY = Math.min(1, (height - sy) / (height * 0.08));
      var alpha = Math.max(0.08, Math.min(1, zFade * edgeFadeX * edgeFadeY * (0.45 + 0.55 * normH)));

      // Dot radius: scales with proximity and peak elevation
      var rad = Math.max(0.9, Math.min(2.8, 1.15 * scale * (0.8 + 0.35 * normH)));

      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, 6.283185307179586);
      ctx.fill();
    }

    ctx.restore();

    animFrameId = requestAnimationFrame(render);
  }

  // IntersectionObserver to pause when off-screen
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        if (!isVisible) {
          isVisible = true;
          lastTime = performance.now();
          animFrameId = requestAnimationFrame(render);
        }
      } else {
        isVisible = false;
        if (animFrameId) {
          cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
      }
    });
  }, { threshold: 0.05 });

  observer.observe(canvas.parentElement || canvas);

  // Resize handling
  window.addEventListener('resize', resize, { passive: true });
  resize();

  // Initial kick-off
  animFrameId = requestAnimationFrame(render);
})();
