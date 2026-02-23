# Adding Images to the PrepSuite Frontend

This guide explains how to add and use images in the PrepSuite React/Vite frontend.

## 1. Static Images (Build-Time)

### Option A: `public/` folder

Place images in the `public/` directory. They are served at the root URL and **not** processed by Vite.

```
public/
  logo.png
  hero-banner.jpg
```

Use in JSX:

```tsx
<img src="/logo.png" alt="Logo" />
<img src="/hero-banner.jpg" alt="Hero" />
```

**Pros:** Simple, no build step, good for large assets  
**Cons:** No cache busting, no optimization

### Option B: Import from `src/` (Recommended)

Place images in `src/assets/` (or any folder under `src/`) and import them. Vite will process, hash, and optimize them.

```
src/
  assets/
    logo.png
    icons/
      check.svg
```

```tsx
import logo from '@/assets/logo.png';
import checkIcon from '@/assets/icons/check.svg';

<img src={logo} alt="Logo" />
<img src={checkIcon} alt="Check" />
```

**Pros:** Cache busting via content hash, tree-shaking, optimized  
**Cons:** Slightly more setup

### Option C: Import as URL

Use the `?url` suffix to get the resolved URL string:

```tsx
import logoUrl from '@/assets/logo.png?url';
<img src={logoUrl} alt="Logo" />
```

Useful when you need the URL for non-`<img>` contexts (e.g. `background-image`, canvas).

---

## 2. Dynamic Images (Runtime)

### From user uploads

Store files in Supabase Storage (or similar) and use the returned public URL:

```tsx
const imageUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
<img src={imageUrl} alt="Avatar" />
```

### From external URLs

Use the URL directly (ensure CORS allows it):

```tsx
<img src="https://example.com/image.jpg" alt="External" crossOrigin="anonymous" />
```

---

## 3. Image Optimization

- **Format:** Prefer WebP for photos; SVG for icons/logos
- **Size:** Resize large images before adding; Vite does not resize by default
- **Lazy loading:** Use `loading="lazy"` for below-the-fold images:
  ```tsx
  <img src={url} alt="..." loading="lazy" />
  ```

---

## 4. Styling with Tailwind

```tsx
<img
  src={logo}
  alt="Logo"
  className="h-12 w-auto object-contain rounded-lg"
/>
```

Common classes: `object-cover`, `object-contain`, `rounded-*`, `shadow-*`

---

## 5. Responsive Images

Use `srcset` for different resolutions:

```tsx
<img
  src="/hero.jpg"
  srcSet="/hero-400.jpg 400w, /hero-800.jpg 800w, /hero-1200.jpg 1200w"
  sizes="(max-width: 768px) 100vw, 800px"
  alt="Hero"
/>
```

---

## 6. Placeholder / Loading States

```tsx
const [loaded, setLoaded] = useState(false);
<img
  src={url}
  alt="..."
  className={loaded ? 'opacity-100' : 'opacity-0'}
  onLoad={() => setLoaded(true)}
/>
```

---

## Quick Reference

| Use Case              | Approach                          |
|-----------------------|-----------------------------------|
| Logo, icons           | `src/assets/` + import            |
| Large hero images     | `public/` or CDN                  |
| User avatars          | Supabase Storage URL              |
| External images       | Direct URL + `crossOrigin`        |
