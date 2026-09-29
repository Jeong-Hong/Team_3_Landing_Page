/*
 * Team 3 공용 저장소 분리 스크립트
 *
 * 각자 index.html의 <meta charset> 바로 다음, 다른 어떤 script보다 먼저 넣는다.
 *   <script src="../../shared/storage-scope.js"></script>
 *
 * - localStorage / sessionStorage 키 앞에 "team3:<폴더명>:"을 자동으로 붙인다.
 *   평소처럼 localStorage.setItem('todos', ...)로 쓰면 된다.
 * - clear()는 자기 폴더의 키만 지운다.
 * - iframe 안에서 누른 Esc를 랜딩에 전달해 뷰어를 닫게 한다.
 *
 * 한계: 브라우저가 강제하는 격리가 아니라 스크립트 규약이다. 이 파일을 빼먹거나
 * IndexedDB·쿠키를 쓰면 분리되지 않는다.
 */
(function () {
  'use strict';

  var segments = location.pathname.split('/');
  var at = segments.lastIndexOf('todos');
  var scope = at >= 0 && segments[at + 1] ? decodeURIComponent(segments[at + 1]) : null;

  if (!scope) {
    console.warn('[storage-scope] todos/<폴더>/ 경로가 아니어서 저장소를 분리하지 않았습니다.');
  } else {
    var PREFIX = 'team3:' + scope + ':';
    var proto = window.Storage && Storage.prototype;

    var wrap = function (name) {
      var real;
      try { real = window[name]; } catch (e) { return; }
      if (!real || !proto) return;

      var getItem = proto.getItem;
      var setItem = proto.setItem;
      var removeItem = proto.removeItem;
      var keyAt = proto.key;

      var scopedKeys = function () {
        var out = [];
        for (var i = 0; i < real.length; i++) {
          var k = keyAt.call(real, i);
          if (k !== null && k.indexOf(PREFIX) === 0) out.push(k.slice(PREFIX.length));
        }
        return out;
      };

      var api = {
        getItem: function (k) { return getItem.call(real, PREFIX + String(k)); },
        setItem: function (k, v) { setItem.call(real, PREFIX + String(k), String(v)); },
        removeItem: function (k) { removeItem.call(real, PREFIX + String(k)); },
        clear: function () {
          scopedKeys().forEach(function (k) { removeItem.call(real, PREFIX + k); });
        },
        key: function (n) {
          var ks = scopedKeys();
          var v = ks[Math.floor(Number(n)) || 0];
          return v === undefined ? null : v;
        },
      };
      var own = function (p) { return Object.prototype.hasOwnProperty.call(api, p); };

      // localStorage.todos = '...' 같은 프로퍼티 방식도 같은 접두사로 처리한다.
      var proxy = new Proxy(api, {
        get: function (t, p) {
          if (typeof p === 'symbol') return p === Symbol.toStringTag ? 'Storage' : undefined;
          if (p === 'length') return scopedKeys().length;
          if (own(p)) return api[p];
          var v = api.getItem(p);
          return v === null ? undefined : v;
        },
        set: function (t, p, v) {
          if (typeof p === 'symbol' || own(p) || p === 'length') return true;
          api.setItem(p, v);
          return true;
        },
        has: function (t, p) {
          if (typeof p === 'symbol') return false;
          return own(p) || p === 'length' || api.getItem(p) !== null;
        },
        deleteProperty: function (t, p) {
          if (typeof p !== 'symbol' && !own(p)) api.removeItem(p);
          return true;
        },
        ownKeys: function () { return scopedKeys(); },
        getOwnPropertyDescriptor: function (t, p) {
          if (typeof p === 'symbol' || own(p)) return undefined;
          var v = api.getItem(p);
          return v === null ? undefined : { value: v, writable: true, enumerable: true, configurable: true };
        },
        defineProperty: function (t, p, d) {
          if (typeof p === 'symbol' || own(p) || !('value' in d)) return false;
          api.setItem(p, d.value);
          return true;
        },
      });

      try {
        Object.defineProperty(window, name, { configurable: true, enumerable: true, get: function () { return proxy; } });
      } catch (e) {
        console.error('[storage-scope] ' + name + '를 감쌀 수 없습니다. 저장소가 분리되지 않습니다.', e);
      }
    };

    wrap('localStorage');
    wrap('sessionStorage');
  }

  // 랜딩 iframe 안에서 누른 Esc를 부모에게 전달한다. 페이지가 Esc를 직접 처리했으면 보내지 않는다.
  if (window.parent !== window) {
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        window.parent.postMessage({ type: 'team3:escape' }, location.origin);
      }
    });
  }
})();
