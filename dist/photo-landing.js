const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
if (!reduceMotion.matches && 'IntersectionObserver' in window) {
  const photos = [...document.querySelectorAll('[data-photo-reveal]')];
  document.body.classList.add('photo-motion');
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.remove('photo-pending');
      observer.unobserve(entry.target);
    }
  }, {threshold:0.06, rootMargin:'0px 0px 35px 0px'});
  for (const photo of photos) {
    if (photo.getBoundingClientRect().top > innerHeight) photo.classList.add('photo-pending');
    observer.observe(photo);
  }
  reduceMotion.addEventListener('change', () => {
    if (!reduceMotion.matches) return;
    for (const photo of photos) photo.classList.remove('photo-pending');
    observer.disconnect();
  });
}
