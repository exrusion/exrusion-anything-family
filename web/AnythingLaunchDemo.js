export class AnythingLaunchDemo extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "true";
    this.render();
    this.replayButton = this.querySelector("[data-demo-replay]");
    this.replayButton?.addEventListener("click", () => this.replay());

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.dataset.reducedMotion = "true";
      return;
    }

    this.dataset.playing = "true";
    this.observer = new IntersectionObserver(([entry]) => {
      this.style.setProperty("--demo-play-state", entry.isIntersecting ? "running" : "paused");
    }, { threshold: 0.16 });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
  }

  getLaunchpads() {
    return [...document.querySelectorAll(".provider[data-provider]")].map((provider) => ({
      name: provider.dataset.name || provider.querySelector("b")?.textContent?.trim() || "Launchpad",
      chain: provider.dataset.chain || "Network",
      logo: provider.querySelector("img")?.getAttribute("src") || "/anything-logo.webp"
    }));
  }

  replay() {
    if (this.dataset.reducedMotion) return;
    delete this.dataset.playing;
    this.style.setProperty("--demo-play-state", "running");
    void this.offsetWidth;
    this.dataset.playing = "true";
  }

  render() {
    const launchpads = this.getLaunchpads();
    const names = launchpads.map(({ name }) => name).join(" · ");
    const networks = [...new Set(launchpads.map(({ chain }) => chain))].join(" · ");
    const cards = launchpads.map(({ name, chain, logo }, index) => `
      <div class="demo-launchpad" style="--demo-index:${index}">
        <img src="${logo}" alt=""><span><b>${name}</b><small>${chain}</small></span><i></i>
      </div>`).join("");

    this.innerHTML = `
      <div class="demo-shell">
        <button class="demo-replay" type="button" data-demo-replay aria-label="Replay product demonstration"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"/></svg><span>Replay</span></button>
        <div class="demo-window">
          <aside class="demo-sidebar" aria-hidden="true">
            <img src="/anything-logo.webp?v=20260914-logo" alt=""><span></span><span></span><span></span><span></span>
          </aside>
          <div class="demo-feed">
            <header class="demo-feed-head"><b>Launch feed</b><span>Anything workspace</span></header>
            <div class="demo-composer">
              <a class="demo-avatar" href="https://x.com/FamAnything" target="_blank" rel="noopener noreferrer" aria-label="Open @FamAnything on X"><img src="/anything-logo.webp?v=20260914-logo" alt="Anything"></a>
              <div class="demo-compose-body"><span class="demo-typed">@FamAnything launch anything</span><span class="demo-caret"></span><div class="demo-attachment"><img src="/anything-logo.webp?v=20260914-logo" alt="Sample Anything token"></div><div class="demo-compose-actions"><span>Image attached</span><button type="button" tabindex="-1">Post</button></div></div>
            </div>
            <div class="demo-published">
              <a class="demo-avatar" href="https://x.com/FamAnything" target="_blank" rel="noopener noreferrer"><img src="/anything-logo.webp?v=20260914-logo" alt="Anything"></a>
              <div><div class="demo-user-line"><b>Anything</b><a href="https://x.com/FamAnything" target="_blank" rel="noopener noreferrer">@FamAnything</a><span>now</span></div><p>@FamAnything launch anything</p><div class="demo-post-image"><img src="/anything-logo.webp?v=20260914-logo" alt="Anything token artwork"></div></div>
            </div>
            <div class="demo-preparing"><i></i><span>Anything is preparing your launch.</span></div>
            <div class="demo-response">
              <a class="demo-avatar" href="https://x.com/FamAnything" target="_blank" rel="noopener noreferrer"><img src="/anything-logo.webp?v=20260914-logo" alt="Anything"></a>
              <div><div class="demo-user-line"><b>Anything</b><a href="https://x.com/FamAnything" target="_blank" rel="noopener noreferrer">@FamAnything</a></div><p>Your launch is ready. Enter the token information once and launch across your selected platforms.</p></div>
            </div>
          </div>
          <aside class="demo-launch-panel">
            <div class="demo-panel-title"><span>Multi-launch</span><b>Select launchpads</b></div>
            <div class="demo-launchpads">${cards}</div>
            <div class="demo-token-preview"><div><span>Token name</span><b>Anything</b></div><div><span>Ticker</span><b>$ANY</b></div><div><span>Mode</span><b>Multi-launch</b></div><div class="demo-preview-wide"><span>Network and launchpads</span><b>${networks}</b><small>${names}</small></div><div class="demo-ready"><i></i><span>Status</span><b>Ready to launch</b></div></div>
          </aside>
          <svg class="demo-pointer" viewBox="0 0 28 34" aria-hidden="true"><path d="M2 2l21 18-10 1 5 9-5 3-5-10-6 7z"/></svg>
          <div class="demo-finale"><img src="/anything-logo.webp?v=20260914-logo" alt=""><p>One form. Multiple launchpads.<br><b>Anything can launch anywhere.</b></p></div>
        </div>
      </div>`;
  }
}

if (!customElements.get("anything-launch-demo")) {
  customElements.define("anything-launch-demo", AnythingLaunchDemo);
}
