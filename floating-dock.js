/**
 * Aceternity-style Floating Dock Navigation
 * Zero-dependency vanilla JS implementation with macOS dock magnification physics,
 * mobile responsive toggle menu, and active section tracking.
 */
(function () {
  'use strict';

  var desktopDock = document.querySelector('.floating-dock-desktop');
  var mobileDock = document.querySelector('.floating-dock-mobile');

  // ==========================================
  // Desktop Dock: macOS Magnification Physics
  // ==========================================
  if (desktopDock) {
    var items = Array.from(desktopDock.querySelectorAll('.dock-item'));
    var BASE_SIZE = 42;
    var MAX_SIZE = 68;
    var BASE_ICON_SIZE = 20;
    var MAX_ICON_SIZE = 32;
    var INFLUENCE_RADIUS = 135;

    // Track size states for smooth spring/lerp animation
    var itemStates = items.map(function (el) {
      return {
        el: el,
        icon: el.querySelector('.dock-icon'),
        currentSize: BASE_SIZE,
        targetSize: BASE_SIZE,
        currentIconSize: BASE_ICON_SIZE,
        targetIconSize: BASE_ICON_SIZE
      };
    });

    var isHovered = false;
    var animFrameId = null;
    var mouseX = -9999;

    function updateTargets() {
      if (!isHovered) {
        for (var i = 0; i < itemStates.length; i++) {
          itemStates[i].targetSize = BASE_SIZE;
          itemStates[i].targetIconSize = BASE_ICON_SIZE;
        }
        return;
      }

      for (var j = 0; j < itemStates.length; j++) {
        var state = itemStates[j];
        var rect = state.el.getBoundingClientRect();
        var itemCenterX = rect.left + rect.width * 0.5;
        var dist = Math.abs(mouseX - itemCenterX);

        if (dist < INFLUENCE_RADIUS) {
          // Cosine bell curve for natural, organic magnification
          var factor = Math.cos((dist / INFLUENCE_RADIUS) * (Math.PI * 0.5));
          state.targetSize = BASE_SIZE + (MAX_SIZE - BASE_SIZE) * factor;
          state.targetIconSize = BASE_ICON_SIZE + (MAX_ICON_SIZE - BASE_ICON_SIZE) * factor;
        } else {
          state.targetSize = BASE_SIZE;
          state.targetIconSize = BASE_ICON_SIZE;
        }
      }
    }

    function animate() {
      if (isHovered) {
        updateTargets();
      }

      var needsNextFrame = false;
      var LERP_FACTOR = 0.22;

      for (var i = 0; i < itemStates.length; i++) {
        var s = itemStates[i];
        var diff = s.targetSize - s.currentSize;

        if (Math.abs(diff) > 0.15) {
          s.currentSize += diff * LERP_FACTOR;
          s.currentIconSize += (s.targetIconSize - s.currentIconSize) * LERP_FACTOR;
          needsNextFrame = true;
        } else {
          s.currentSize = s.targetSize;
          s.currentIconSize = s.targetIconSize;
        }

        s.el.style.width = s.currentSize.toFixed(1) + 'px';
        s.el.style.height = s.currentSize.toFixed(1) + 'px';

        if (s.icon) {
          s.icon.style.width = s.currentIconSize.toFixed(1) + 'px';
          s.icon.style.height = s.currentIconSize.toFixed(1) + 'px';
        }
      }

      if (needsNextFrame || isHovered) {
        animFrameId = requestAnimationFrame(animate);
      } else {
        for (var k = 0; k < itemStates.length; k++) {
          itemStates[k].el.style.width = '';
          itemStates[k].el.style.height = '';
          if (itemStates[k].icon) {
            itemStates[k].icon.style.width = '';
            itemStates[k].icon.style.height = '';
          }
          itemStates[k].currentSize = BASE_SIZE;
          itemStates[k].currentIconSize = BASE_ICON_SIZE;
        }
        animFrameId = null;
      }
    }

    desktopDock.addEventListener('mouseenter', function (e) {
      isHovered = true;
      mouseX = e.clientX;
      updateTargets();
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(animate);
      }
    });

    desktopDock.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      updateTargets();
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(animate);
      }
    });

    desktopDock.addEventListener('mouseleave', function () {
      isHovered = false;
      mouseX = -9999;
      updateTargets();
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(animate);
      }
    });
  }

  // ==========================================
  // Mobile Dock: Expandable Toggle Menu
  // ==========================================
  if (mobileDock) {
    var toggleBtn = mobileDock.querySelector('.dock-mobile-toggle');
    var mobileLinks = mobileDock.querySelectorAll('.dock-mobile-item');

    function toggleMobileMenu(open) {
      var shouldOpen = typeof open === 'boolean' ? open : !mobileDock.classList.contains('is-open');
      if (shouldOpen) {
        mobileDock.classList.add('is-open');
        toggleBtn.setAttribute('aria-expanded', 'true');
      } else {
        mobileDock.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMobileMenu();
      });
    }

    // Close mobile menu when clicking any link
    mobileLinks.forEach(function (link) {
      link.addEventListener('click', function () {
        toggleMobileMenu(false);
      });
    });

    // Close when clicking outside
    document.addEventListener('click', function (e) {
      if (mobileDock.classList.contains('is-open') && !mobileDock.contains(e.target)) {
        toggleMobileMenu(false);
      }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mobileDock.classList.contains('is-open')) {
        toggleMobileMenu(false);
        toggleBtn.focus();
      }
    });
  }

  // ==========================================
  // Active Section Spy (Desktop & Mobile)
  // ==========================================
  var sectionIds = ['top', 'research', 'projects', 'interests', 'about'];
  var sectionElements = sectionIds
    .map(function (id) {
      return document.getElementById(id);
    })
    .filter(Boolean);

  if ('IntersectionObserver' in window && sectionElements.length > 0) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var currentId = entry.target.id;
            var targetHash = currentId === 'top' ? '#top' : '#' + currentId;

            // Highlight corresponding link
            var allDockLinks = document.querySelectorAll(
              '.floating-dock .dock-item, .floating-dock .dock-mobile-item'
            );

            allDockLinks.forEach(function (link) {
              if (link.getAttribute('href') === targetHash) {
                link.classList.add('is-active');
              } else if (link.getAttribute('href') && link.getAttribute('href').startsWith('#')) {
                link.classList.remove('is-active');
              }
            });
          }
        });
      },
      {
        rootMargin: '-30% 0px -60% 0px',
        threshold: 0
      }
    );

    sectionElements.forEach(function (sec) {
      observer.observe(sec);
    });
  }
})();
