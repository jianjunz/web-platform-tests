'use strict';
const { URL } = require('url');
const { parseFromString } = require('../lib/parser.js');
const { resolve } = require('../lib/resolver.js');

const mapBaseURL = new URL('https://example.com/app/index.html');
const scriptURL = new URL('https://example.com/js/app.mjs');

function makeResolveUnderTest(mapString) {
  const map = parseFromString(mapString, mapBaseURL);
  return specifier => resolve(specifier, map, scriptURL);
}

describe('Unmapped', () => {
  const resolveUnderTest = makeResolveUnderTest(`{}`);

  it('should resolve ./ specifiers as URLs', () => {
    expect(resolveUnderTest('./foo')).toMatchURL('https://example.com/js/foo');
    expect(resolveUnderTest('./foo/bar')).toMatchURL('https://example.com/js/foo/bar');
    expect(resolveUnderTest('./foo/../bar')).toMatchURL('https://example.com/js/bar');
    expect(resolveUnderTest('./foo/../../bar')).toMatchURL('https://example.com/bar');
  });

  it('should resolve ../ specifiers as URLs', () => {
    expect(resolveUnderTest('../foo')).toMatchURL('https://example.com/foo');
    expect(resolveUnderTest('../foo/bar')).toMatchURL('https://example.com/foo/bar');
    expect(resolveUnderTest('../../../foo/bar')).toMatchURL('https://example.com/foo/bar');
  });

  it('should resolve / specifiers as URLs', () => {
    expect(resolveUnderTest('/foo')).toMatchURL('https://example.com/foo');
    expect(resolveUnderTest('/foo/bar')).toMatchURL('https://example.com/foo/bar');
    expect(resolveUnderTest('/../../foo/bar')).toMatchURL('https://example.com/foo/bar');
    expect(resolveUnderTest('/../foo/../bar')).toMatchURL('https://example.com/bar');
  });

  it('should parse absolute fetch-scheme URLs', () => {
    expect(resolveUnderTest('about:good')).toMatchURL('about:good');
    expect(resolveUnderTest('https://example.net')).toMatchURL('https://example.net/');
    expect(resolveUnderTest('https://ex%41mple.com/')).toMatchURL('https://example.com/');
    expect(resolveUnderTest('https:example.org')).toMatchURL('https://example.org/');
    expect(resolveUnderTest('https://///example.com///')).toMatchURL('https://example.com///');
  });

  it('should parse absolute non-fetch-scheme URLs', () => {
    expect(resolveUnderTest('mailto:bad')).toMatchURL('mailto:bad');
    expect(resolveUnderTest('import:bad')).toMatchURL('import:bad');
    expect(resolveUnderTest('javascript:bad')).toMatchURL('javascript:bad');
    expect(resolveUnderTest('wss:bad')).toMatchURL('wss://bad/');
  });

  it('should fail for strings not parseable as absolute URLs and not starting with ./ ../ or /', () => {
    expect(() => resolveUnderTest('foo')).toThrow(TypeError);
    expect(() => resolveUnderTest('\\foo')).toThrow(TypeError);
    expect(() => resolveUnderTest(':foo')).toThrow(TypeError);
    expect(() => resolveUnderTest('@foo')).toThrow(TypeError);
    expect(() => resolveUnderTest('%2E/foo')).toThrow(TypeError);
    expect(() => resolveUnderTest('%2E%2E/foo')).toThrow(TypeError);
    expect(() => resolveUnderTest('.%2Ffoo')).toThrow(TypeError);
    expect(() => resolveUnderTest('https://ex ample.org/')).toThrow(TypeError);
    expect(() => resolveUnderTest('https://example.com:demo')).toThrow(TypeError);
    expect(() => resolveUnderTest('http://[www.example.com]/')).toThrow(TypeError);
  });
});

describe('Mapped using the "imports" key only (no scopes)', () => {
  describe('Package-like scenarios', () => {
    const resolveUnderTest = makeResolveUnderTest(`{
      "imports": {
        "moment": "/node_modules/moment/src/moment.js",
        "moment/": "/node_modules/moment/src/",
        "lodash-dot": "./node_modules/lodash-es/lodash.js",
        "lodash-dot/": "./node_modules/lodash-es/",
        "lodash-dotdot": "../node_modules/lodash-es/lodash.js",
        "lodash-dotdot/": "../node_modules/lodash-es/"
      }
    }`);

    it('should work for package main modules', () => {
      expect(resolveUnderTest('moment')).toMatchURL('https://example.com/node_modules/moment/src/moment.js');
      expect(resolveUnderTest('lodash-dot')).toMatchURL('https://example.com/app/node_modules/lodash-es/lodash.js');
      expect(resolveUnderTest('lodash-dotdot')).toMatchURL('https://example.com/node_modules/lodash-es/lodash.js');
    });

    it('should work for package submodules', () => {
      expect(resolveUnderTest('moment/foo')).toMatchURL('https://example.com/node_modules/moment/src/foo');
      expect(resolveUnderTest('lodash-dot/foo')).toMatchURL('https://example.com/app/node_modules/lodash-es/foo');
      expect(resolveUnderTest('lodash-dotdot/foo')).toMatchURL('https://example.com/node_modules/lodash-es/foo');
    });

    it('should work for package names that end in a slash by just passing through', () => {
      // TODO: is this the right behavior, or should we throw?
      expect(resolveUnderTest('moment/')).toMatchURL('https://example.com/node_modules/moment/src/');
    });

    it('should still fail for package modules that are not declared', () => {
      expect(() => resolveUnderTest('underscore/')).toThrow(TypeError);
      expect(() => resolveUnderTest('underscore/foo')).toThrow(TypeError);
    });
  });

  describe('Tricky specifiers', () => {
    const resolveUnderTest = makeResolveUnderTest(`{
      "imports": {
        "package/withslash": "/node_modules/package-with-slash/index.mjs",
        "not-a-package": "/lib/not-a-package.mjs",
        "only-slash/": "/lib/only-slash/",
        ".": "/lib/dot.mjs",
        "..": "/lib/dotdot.mjs",
        "..\\\\": "/lib/dotdotbackslash.mjs",
        "%2E": "/lib/percent2e.mjs",
        "%2F": "/lib/percent2f.mjs"
      }
    }`);

    it('should work for explicitly-mapped specifiers that happen to have a slash', () => {
      expect(resolveUnderTest('package/withslash')).toMatchURL('https://example.com/node_modules/package-with-slash/index.mjs');
    });

    it('should work when the specifier has punctuation', () => {
      expect(resolveUnderTest('.')).toMatchURL('https://example.com/lib/dot.mjs');
      expect(resolveUnderTest('..')).toMatchURL('https://example.com/lib/dotdot.mjs');
      expect(resolveUnderTest('..\\')).toMatchURL('https://example.com/lib/dotdotbackslash.mjs');
      expect(resolveUnderTest('%2E')).toMatchURL('https://example.com/lib/percent2e.mjs');
      expect(resolveUnderTest('%2F')).toMatchURL('https://example.com/lib/percent2f.mjs');
    });

    it('should fail for attempting to get a submodule of something not declared with a trailing slash', () => {
      expect(() => resolveUnderTest('not-a-package/foo')).toThrow(TypeError);
    });

    it('should fail for attempting to get a module if only a trailing-slash version is present', () => {
      expect(() => resolveUnderTest('only-slash')).toThrow(TypeError);
    });
  });

  describe('URL-like specifiers', () => {
    const resolveUnderTest = makeResolveUnderTest(`{
      "imports": {
        "/lib/foo.mjs": "./more/bar.mjs",
        "./dotrelative/foo.mjs": "/lib/dot.mjs",
        "../dotdotrelative/foo.mjs": "/lib/dotdot.mjs",

        "/": "/lib/slash-only/",
        "./": "/lib/dotslash-only/",

        "/test/": "/lib/url-trailing-slash/",
        "./test/": "/lib/url-trailing-slash-dot/",

        "/test": "/lib/test1.mjs",
        "../test": "/lib/test2.mjs"
      }
    }`);

    it('should remap to other URLs', () => {
      expect(resolveUnderTest('https://example.com/lib/foo.mjs')).toMatchURL('https://example.com/app/more/bar.mjs');
      expect(resolveUnderTest('https://///example.com/lib/foo.mjs')).toMatchURL('https://example.com/app/more/bar.mjs');
      expect(resolveUnderTest('/lib/foo.mjs')).toMatchURL('https://example.com/app/more/bar.mjs');

      expect(resolveUnderTest('https://example.com/app/dotrelative/foo.mjs')).toMatchURL('https://example.com/lib/dot.mjs');
      expect(resolveUnderTest('../app/dotrelative/foo.mjs')).toMatchURL('https://example.com/lib/dot.mjs');

      expect(resolveUnderTest('https://example.com/dotdotrelative/foo.mjs')).toMatchURL('https://example.com/lib/dotdot.mjs');
      expect(resolveUnderTest('../dotdotrelative/foo.mjs')).toMatchURL('https://example.com/lib/dotdot.mjs');
    });

    it('should remap URLs that are just composed from / and .', () => {
      expect(resolveUnderTest('https://example.com/')).toMatchURL('https://example.com/lib/slash-only/');
      expect(resolveUnderTest('/')).toMatchURL('https://example.com/lib/slash-only/');
      expect(resolveUnderTest('../')).toMatchURL('https://example.com/lib/slash-only/');

      expect(resolveUnderTest('https://example.com/app/')).toMatchURL('https://example.com/lib/dotslash-only/');
      expect(resolveUnderTest('/app/')).toMatchURL('https://example.com/lib/dotslash-only/');
      expect(resolveUnderTest('../app/')).toMatchURL('https://example.com/lib/dotslash-only/');
    });

    it('should remap URLs that are prefix-matched by keys with trailing slashes', () => {
      expect(resolveUnderTest('/test/foo.mjs')).toMatchURL('https://example.com/lib/url-trailing-slash/foo.mjs');
      expect(resolveUnderTest('https://example.com/app/test/foo.mjs')).toMatchURL('https://example.com/lib/url-trailing-slash-dot/foo.mjs');
    });

    it('should use the last entry\'s address when URL-like specifiers parse to the same absolute URL', () => {
      expect(resolveUnderTest('/test')).toMatchURL('https://example.com/lib/test2.mjs');
    });
  });

  describe('Overlapping entries with trailing slashes', () => {
    it('should favor the most-specific key', () => {
      const resolveUnderTest = makeResolveUnderTest(`{
        "imports": {
          "a": "/1",
          "a/": "/2/",
          "a/b": "/3",
          "a/b/": "/4/"
        }
      }`);

      expect(resolveUnderTest('a')).toMatchURL('https://example.com/1');
      expect(resolveUnderTest('a/')).toMatchURL('https://example.com/2/');
      expect(resolveUnderTest('a/b')).toMatchURL('https://example.com/3');
      expect(resolveUnderTest('a/b/')).toMatchURL('https://example.com/4/');
      expect(resolveUnderTest('a/b/c')).toMatchURL('https://example.com/4/c');
    });

    it('should favor the most-specific key when there are no mappings for less-specific keys', () => {
      const resolveUnderTest = makeResolveUnderTest(`{
        "imports": {
          "a/b": "/3",
          "a/b/": "/4/"
        }
      }`);

      expect(() => resolveUnderTest('a')).toThrow(TypeError);
      expect(() => resolveUnderTest('a/')).toThrow(TypeError);
      expect(() => resolveUnderTest('a/x')).toThrow(TypeError);
      expect(resolveUnderTest('a/b')).toMatchURL('https://example.com/3');
      expect(resolveUnderTest('a/b/')).toMatchURL('https://example.com/4/');
      expect(resolveUnderTest('a/b/c')).toMatchURL('https://example.com/4/c');
      expect(() => resolveUnderTest('a/x/c')).toThrow(TypeError);
    });
  });

  it('should deal with data: URL bases', () => {
    const resolveUnderTest = makeResolveUnderTest(`{
      "imports": {
        "foo/": "data:text/javascript,foo/"
      }
    }`);

    expect(() => resolveUnderTest('foo/bar')).toThrow(TypeError);
  });
});
