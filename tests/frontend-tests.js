(async () => {
  const results = [], C = window.EasyWindowsPackComponents;
  function check(name, value) { if (!value) throw new Error(name); results.push(name); }
  const next = () => new Promise(resolve => setTimeout(resolve, 30));
  const root = document.createElement('div'); root.style.width = '500px'; document.body.append(root);
  const progress = C.createMatrixProgress(root, {value:50, size:4});
  try {
    check('matrix renders', root.querySelectorAll('.ewp-matrix-dot').length > 0);
    check('half fill', Math.abs(root.querySelectorAll('.is-filled').length - root.querySelectorAll('.ewp-matrix-dot').length / 2) <= 1);
    const before = root.innerHTML; progress.update({value:50}); check('stable fill', before === root.innerHTML);
    progress.update({value:NaN}); check('invalid input clamps', root.getAttribute('aria-valuenow') === '0');
    progress.update({value:200}); check('upper clamp', root.getAttribute('aria-valuenow') === '100');
    progress.update({value:-20}); check('lower clamp', root.getAttribute('aria-valuenow') === '0');
    progress.update({unlimited:true}); check('unlimited', root.dataset.tone === 'unlimited' && root.getAttribute('aria-valuenow') === '100');
    root.style.width = '80px'; await next(); check('narrow fallback', !!root.querySelector('.ewp-linear'));
    root.style.width = '500px'; await next(); check('resize recovery', !!root.querySelector('.ewp-matrix'));
    progress.dispose(); check('progress disposal', !root.children.length && !root.hasAttribute('role'));
    const workspace = document.createElement('div'); workspace.innerHTML = '<button data-ewp-enter>Work</button>'; document.body.append(workspace);
    const entrance = C.createEntrance(workspace);
    check('pending guarded', workspace.inert && getComputedStyle(workspace).visibility === 'hidden');
    document.documentElement.dataset.motion = 'off'; entrance.reveal(); await next();
    check('reduced entrance ready', workspace.dataset.ewpEntry === 'ready' && !workspace.inert);
    entrance.prepare(); check('replay pending', workspace.dataset.ewpEntry === 'pending'); entrance.dispose();
    check('entrance disposal', !workspace.hasAttribute('data-ewp-entry') && !workspace.inert);
    const mask = document.createElement('div'); document.body.append(mask);
    let completions = 0, reason;
    const curtain = C.createBootCurtain(mask, {timeout:20, onComplete:event => { completions++; reason = event.reason; }});
    await next(); check('curtain watchdog', mask.hidden && reason === 'timeout');
    curtain.setReady(); await next(); check('curtain completes once', completions === 1); curtain.dispose();
    let ready = false;
    const curtain2 = C.createBootCurtain(mask, {onComplete:()=>{ready = true;}}); curtain2.setReady(); await next();
    check('reduced curtain exits', ready && mask.hidden); curtain2.dispose();
    let calls = [], current = {status:'ready', install_token:'token'}, errors = [];
    const bridge = {get_update_state:async()=>current, confirm_update_ready:async()=>calls.push('ack'),
      check_for_updates:async flag=>calls.push(['check', flag]), download_update:async()=>calls.push('download'),
      install_update:async token=>{calls.push(['install',token]);return {accepted:true};}};
    const client = createDesktopUpdateClient({host:'turtleclaw', bridge:()=>bridge, onError:error=>errors.push(error)});
    check('no early startup calls', calls.length === 0);
    await Promise.all([client.markFrontendReady({checkOnStartup:true}), client.markFrontendReady({checkOnStartup:true})]);
    check('single acknowledgement', calls.filter(value=>value === 'ack').length === 1);
    check('single startup check', calls.filter(Array.isArray).length === 1);
    check('check is not install', !calls.some(value=>Array.isArray(value) && value[0] === 'install'));
    await client.install('token'); check('token forwarded', calls.some(value=>Array.isArray(value) && value[1] === 'token'));
    let rejected = false; try { await client.cancel(); } catch { rejected = true; }
    check('unsupported rejects', rejected); client.dispose();
    rejected = false; try { await client.download(); } catch { rejected = true; } check('disposed rejects', rejected);
    let snapshot, args;
    const api = createDesktopUpdateClient({host:'api-tools', bridge:()=>({get_state:async()=>({update:{status:'idle',percent:8}}),
      check_for_updates:async(...value)=>{args = value; return {ok:true};}}), onState:value=>{snapshot = value;}});
    await api.check(); check('api tools snapshot', snapshot.percent === 8); check('api tools check has no args', args.length === 0); api.dispose();
    check('no background errors', errors.length === 0);
    window.testResults = {passed:results.length, tests:results};
  } catch (error) { window.testResults = {passed:results.length, error:error.stack}; }
  finally { document.getElementById('results').textContent = JSON.stringify(window.testResults, null, 2); }
})();