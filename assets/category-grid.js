(function () {
	if (customElements.get('category-grid')) return;

	var canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
	var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

	function attachSources(video) {
		if (video.dataset.loaded) return;
		video.querySelectorAll('source[data-src]').forEach(function (source) {
			source.src = source.dataset.src;
			source.removeAttribute('data-src');
		});
		video.dataset.loaded = 'true';
		video.load();
	}

	function play(card) {
		if (!canHover.matches || reducedMotion.matches) return;
		var video = card.querySelector('.category-grid__video');
		if (!video) return;
		attachSources(video);
		video.muted = true;
		var p = video.play();
		if (p && p.catch) p.catch(function () {});
	}

	function stop(card) {
		var video = card.querySelector('.category-grid__video');
		card.classList.remove('is-video-playing');
		if (video && !video.paused) video.pause();
	}

	class CategoryGrid extends HTMLElement {
		connectedCallback() {
			this.querySelectorAll('[data-category-video]').forEach(function (card) {
				var video = card.querySelector('.category-grid__video');
				if (!video) return;
				video.addEventListener('playing', function () {
					card.classList.add('is-video-playing');
				});
				card.addEventListener('mouseenter', function () { play(card); });
				card.addEventListener('mouseleave', function () { stop(card); });
				card.addEventListener('focusin', function () { play(card); });
				card.addEventListener('focusout', function () { stop(card); });
			});
		}
	}

	customElements.define('category-grid', CategoryGrid);
})();
