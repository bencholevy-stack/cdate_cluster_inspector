Date Cluster Inspector PWA v2.7.0

WHAT CHANGED
- Latest Date Cluster Inspector kept intact.
- Gallery multi-photo import uses Android Share Target:
  Gallery -> select photos (or Select all in album) -> Share -> Date Cluster Inspector.
- Direct file picker remains only as fallback.
- Install once in Chrome. Future versions update in place with an "Update now" prompt.
- Analysis remains local in the browser; the PWA has no upload API.

IMPORTANT
A PWA Share Target only registers when the app is served from HTTPS (or localhost) and installed in Chrome.
The included GitHub Pages workflow can host this static folder over HTTPS.
