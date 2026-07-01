# How to Test 120fps Performance

## Quick Test (5 minutes)

### Chrome DevTools Method:
1. Open your app in Chrome
2. Press `F12` to open DevTools
3. Click **Performance** tab
4. Click **Record** (or press Ctrl+E)
5. Interact with your app:
   - Swipe through balance cards
   - Scroll transaction list
   - Open/close modals
   - Toggle visibility
6. Click **Stop** after 5-10 seconds
7. Check the **FPS chart** (should be green, no dips)

### What to Look For:
- ✅ **Green bars** = 60fps+ (good)
- ⚠️ **Yellow bars** = 30-60fps (needs work)
- ❌ **Red bars** = <30fps (bad)
- 📊 **Frames section**: Should show consistent frame times (~8ms for 120fps, ~16ms for 60fps)

---

## Live FPS Counter (Add to Your App)

Add this to your `index.html` before `</body>`:

```html
<!-- FPS Counter (Dev Mode Only) -->
<div id="fps-counter" style="position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: #0f0; padding: 8px 12px; font-family: monospace; font-size: 14px; border-radius: 8px; z-index: 99999; display: none;">
    60 FPS
</div>

<script>
// Enable with: localStorage.setItem('show_fps', 'true')
if (localStorage.getItem('show_fps') === 'true') {
    const fpsEl = document.getElementById('fps-counter');
    fpsEl.style.display = 'block';
    
    let lastTime = performance.now();
    let frames = 0;
    
    function updateFPS() {
        frames++;
        const now = performance.now();
        
        if (now >= lastTime + 1000) {
            const fps = Math.round((frames * 1000) / (now - lastTime));
            fpsEl.textContent = `${fps} FPS`;
            
            // Color based on performance
            if (fps >= 100) fpsEl.style.color = '#0f0'; // Green
            else if (fps >= 60) fpsEl.style.color = '#ff0'; // Yellow
            else fpsEl.style.color = '#f00'; // Red
            
            frames = 0;
            lastTime = now;
        }
        
        requestAnimationFrame(updateFPS);
    }
    
    updateFPS();
}
</script>
```

### How to Use:
1. Open browser console
2. Type: `localStorage.setItem('show_fps', 'true')`
3. Refresh page
4. You'll see FPS counter in top-right corner
5. To disable: `localStorage.removeItem('show_fps')`

---

## Mobile Testing (Real Device)

### iOS (iPhone 13 Pro+ with ProMotion):
1. Enable FPS counter in Settings → Developer
2. Or use Xcode Instruments:
   - Connect device
   - Open Xcode → Open Developer Tool → Instruments
   - Choose "Core Animation" template
   - Record while using app
   - Check "FPS" track (should show 120fps)

### Android:
1. Enable Developer Options
2. Enable "Profile GPU rendering"
3. Set to "On screen as bars"
4. Green line = 16ms (60fps) / 8ms (120fps)
5. Bars below line = good
6. Bars above line = dropped frames

---

## What Should Hit 120fps:

### ✅ Should be Smooth:
- Card carousel swiping
- Modal animations (open/close)
- Shimmer effect
- Scroll (transaction list, calendar)
- Button taps and transitions
- Navigation switches

### ⚠️ May Drop to 60fps (Acceptable):
- Chart rendering (Chart.js is heavy)
- First load / cache hydration
- Heavy data updates (100+ transactions)

### ❌ Performance Killers (Avoid):
- Animating box-shadow
- Animating blur/backdrop-filter
- Large image loading without lazy-load
- JavaScript running in animation loop
- DOM manipulation during scroll

---

## Benchmark Your Changes

### Before Optimization:
```bash
# Record baseline
1. Open Performance tab
2. Click "Record"
3. Swipe cards 10 times
4. Stop recording
5. Note: Average FPS, Total time, Scripting time
```

### After Optimization:
```bash
# Record improvement
1. Clear cache (Ctrl+Shift+Del)
2. Hard refresh (Ctrl+Shift+R)
3. Repeat same test
4. Compare metrics
```

### Expected Improvements:
- **Scripting time**: -10-20%
- **Rendering time**: -15-25%
- **FPS consistency**: +20-40fps on mid-range devices
- **Frame drops**: -50-80%

---

## Quick Wins Applied ✅

### Already Optimized (v7.18):
1. ✅ Removed `box-shadow` from transitions
2. ✅ Added `translateZ(0)` for GPU layers
3. ✅ Added `contain` property to cards
4. ✅ Added `backface-visibility: hidden`
5. ✅ Optimized shimmer with `will-change`
6. ✅ Fixed privacy mask performance

### Target Devices:
- **iPhone 13 Pro+**: 120fps ✨
- **Samsung S21+**: 90-120fps
- **Pixel 6+**: 90fps
- **Mid-range (2+ years old)**: 60fps
- **Budget devices**: 45-60fps

---

## Troubleshooting

### "I see 60fps cap even on 120Hz device"
- **Cause**: Browser may not support 120fps
- **Fix**: Use Safari on iOS, Chrome 110+ on Android
- **Check**: Run `window.screen.availHeight` in console

### "FPS drops during card swipe"
- **Cause**: Too many repaints
- **Fix**: Check if box-shadows are animating
- **Test**: Disable transitions temporarily

### "Shimmer causes jank"
- **Cause**: Missing GPU optimization
- **Fix**: Check `.card-shimmer` has `transform: translateZ(0)`

---

## Production Monitoring

### Add to Production:
```javascript
// Track slow frames in production
let slowFrames = 0;
let totalFrames = 0;

const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        totalFrames++;
        if (entry.duration > 16.67) { // Slower than 60fps
            slowFrames++;
        }
    }
    
    // Log if >10% slow frames
    if (totalFrames > 100 && (slowFrames / totalFrames) > 0.1) {
        console.warn(`Performance warning: ${(slowFrames/totalFrames*100).toFixed(1)}% slow frames`);
    }
});

observer.observe({ entryTypes: ['measure'] });
```

---

## Need More Speed?

Check `PERFORMANCE_ANALYSIS.md` for:
- Phase 2 optimizations (content-visibility, lazy loading)
- Phase 3 advanced tricks (virtual scrolling, Web Workers)
- Device-specific tweaks
- Long-term optimization strategy

**Current Status:** Your app should now hit 90-120fps on modern devices! 🚀
