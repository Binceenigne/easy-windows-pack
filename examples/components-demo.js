const components = window.EasyWindowsPackComponents;
const workspace = document.getElementById('workspace');
// The HTML provides the first-paint guard; the entrance restores interaction.
workspace.inert = false; workspace.removeAttribute('aria-hidden');
const entrance = components.createEntrance(workspace);
const quota = components.createMatrixProgress(document.getElementById('quota'), {value:68, remaining:68, label:'Remaining quota'});
const download = components.createMatrixProgress(document.getElementById('download'), {value:42, label:'Download'});
const limit = components.createMatrixProgress(document.getElementById('limit'), {value:85, label:'Quota limit'});
const narrow = components.createMatrixProgress(document.getElementById('narrow'), {value:60, label:'Compact progress'});
let curtain;
function replay() {
  curtain?.dispose(); entrance.prepare();
  curtain = components.createBootCurtain(document.getElementById('curtain'), {onComplete:()=>entrance.reveal()});
  curtain.setReady();
}
document.getElementById('value').addEventListener('input', event => {
  const value = Number(event.target.value); quota.update({value, remaining:value}); document.getElementById('amount').textContent = `${value}%`;
});
document.getElementById('size').addEventListener('change', event => quota.update({size:Number(event.target.value)}));
document.getElementById('unlimited').addEventListener('change', event => limit.update({unlimited:event.target.checked}));
document.getElementById('motion').addEventListener('click', event => {
  const off = document.documentElement.dataset.motion !== 'off';
  document.documentElement.dataset.motion = off ? 'off' : 'on'; event.target.setAttribute('aria-pressed', String(off));
});
document.getElementById('replay').addEventListener('click', replay);
window.addEventListener('pagehide', () => { curtain.dispose(); entrance.dispose(); [quota, download, limit, narrow].forEach(item => item.dispose()); });
replay();