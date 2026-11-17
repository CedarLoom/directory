import { describe, expect, it } from 'vitest';
import { withPolicy } from './post-build.ts';

describe('withPolicy', () => {
  it('allows each inline script by its hash and leaves scripts with a source to self', () => {
    const page =
      '<html><head><title>x</title></head><body><script>a</script><script src="/x.js"></script></body></html>';
    expect(withPolicy(page)).toBe(
      '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'; ' +
        "script-src 'self' 'sha256-ypeBEsobvcr6wjGzmiPcTaeG7/gUfE5yuYB3ha/uSLs='; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'\"/><title>x</title></head><body><script>a</script>" +
        '<script src="/x.js"></script></body></html>',
    );
  });

  it('refuses an inline event handler, which a hash cannot allow', () => {
    expect(() => withPolicy('<html><head></head><body onload="go()"></body></html>')).toThrow();
  });
});
