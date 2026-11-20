// Запуск: восстановить тетрадь, собрать интерфейс, дождаться шрифтов
(async function () {
  const QB = window.QB;
  QB.ui.buildRail();
  QB.ui.bindTop();
  const had = await QB.store.restore();
  if (!had) {
    try { if (matchMedia('(prefers-color-scheme: dark)').matches) QB.store.doc.theme = 'chalk'; } catch (e) { /* ок */ }
  }
  QB.ui.renderPages();
  QB.tools.setTool('pen');
  QB.notes.sync(); // если открыт конспект — показать его
  QB.ui.refreshTop();
  QB.ui.saveState('saved');
  if (!had) setTimeout(() => QB.ui.toast('Нажми ? — подсказки и горячие клавиши', 4000), 600);

  // шрифты догрузились — пересчитать размеры текста
  if (document.fonts) {
    Promise.all(['500 24px Manrope', '600 24px Caveat'].map((f) => document.fonts.load(f).catch(() => null)))
      .then(() => { QB.geom.resetCache(); QB.requestDraw(); });
  }
  // если MathJax не загрузился за 15 с — скажем об этом
  setTimeout(() => { if (QB.formula.state() === 'loading' && !window.MathJax?.tex2svg) QB.formula.onFail(); }, 15000);
})();
