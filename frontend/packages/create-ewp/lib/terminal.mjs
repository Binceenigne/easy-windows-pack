/** Shared CLI palette. Plain pipes stay readable; explicit color settings win. */
export function createColors({ env = process.env, stream = process.stdout } = {}) {
  const enabled = env.NO_COLOR === undefined && (env.FORCE_COLOR !== undefined
    ? env.FORCE_COLOR !== '0' : Boolean(stream.isTTY) && env.TERM !== 'dumb');
  const wrap = code => value => enabled ? `\x1b[${code}m${value}\x1b[0m` : String(value);
  return {
    enabled,
    top: wrap('38;2;194;152;255'),
    left: wrap('38;2;143;194;255'),
    right: wrap('38;2;62;123;231'),
    title: wrap('1;35'), command: wrap('96'), dim: wrap('90'),
    success: wrap('92'), warning: wrap('93'), error: wrap('91')
  };
}

// Eight rows sampled from the authoritative ewp-color.svg. Spaces preserve
// the transparent center and the seams between the three faces.
const CORE = [
  '          t          ',
  '     ttttttttttt     ',
  '    ttttttttttttt    ',
  '  llll         rrrr  ',
  '  llllll     rrrrrr  ',
  '  llllllll rrrrrrrr  ',
  '    llllll rrrrrr    ',
  '         l r         '
];

export function compactBanner(version, colors = createColors()) {
  const title = [
    '', colors.top(' ___  _ _ _  ___ '),
    colors.left('| -_|| | | || . |'),
    colors.left('|___||_____||  _|'),
    colors.right('            |_|  '), '',
    colors.dim('EASY WINDOWS PACK'), colors.title(`v${version}`)
  ];
  return CORE.map((row, index) => '  ' + row.replace(/t+|l+|r+/g, face =>
    ({ t: colors.top, l: colors.left, r: colors.right })[face[0]]('#'.repeat(face.length))
  ) + '   ' + title[index]).join('\n');
}