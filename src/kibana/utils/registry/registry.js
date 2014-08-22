define(function (require) {

  var _ = require('lodash');

  var pathGetter = require('utils/registry/_path_getter');
  var inflector = require('utils/registry/_inflector');

  var inflectIndex = inflector('by');
  var inflectOrder = inflector('in', 'Order');

  var CLEAR_CACHE = {};

  /**
   * Generic extension of Array class, which will index (and reindex) the
   * objects it contains based on their properties.
   *
   * @param {object}   [config]            - describes the properties of this registry object
   * @param {string[]} [config.index]      - a list of props/paths that should be used to index the docs.
   * @param {string[]} [config.group]      - a list of keys/paths to group docs by.
   * @param {string[]} [config.order]      - a list of keys/paths to order the keys by.
   * @param {object[]} [config.initialSet] - the initial dataset the Registry should contain.
   * @param {boolean}  [config.immutable]  - a flag that hints to people reading the implementation
   *                                       that this Registry should not be modified. It's modification
   *                                       methods are also removed
   */
  _(Registry).inherits(Array);
  function Registry(config) {
    Registry.Super.call(this);
    config = config || {};
    this.raw = [];

    // setup indices
    this._indexNames = _.union(
      this._setupIndices(config.group, inflectIndex, _.groupBy),
      this._setupIndices(config.index, inflectIndex, _.indexBy),
      this._setupIndices(config.order, inflectOrder, _.sortBy)
    );

    if (config.initialSet) {
      this.push.apply(this, config.initialSet);
    }

    if (config.immutable) {
      // just a hint, bugs caused by updates not propogating would be very
      // very very hard to track down
      this.push = this.splice = undefined;
    }
  }

  /**
   * Create indices for a group of object properties. getters and setters are used to
   * read and control the indices.
   *
   * @param  {string[]} props   - the properties that should be used to index docs
   * @param  {function} inflect - a function that will be called with a property name, and
   *                            creates the public property at which the index will be exposed
   * @param  {function} op      - the function that will be used to create the indices, it is passed
   *                            the raw representaion of the registry, and a getter for reading the
   *                            right prop
   *
   * @returns {string[]}        - the public keys of all indices created
   */
  Registry.prototype._setupIndices = function (props, inflect, op) {
    // shortcut for empty props
    if (!props || props.length === 0) return;

    var self = this;
    return props.map(function (prop) {

      var from = pathGetter(prop);
      var to = inflect(prop);
      var cache;

      Object.defineProperty(self, to, {
        enumerable: false,
        configurable: false,

        set: function (val) {
          // can't set any value other than the CLEAR_CACHE constant
          if (val === CLEAR_CACHE) {
            cache = false;
          } else {
            throw new TypeError(to + ' can not be set, it is a computed index of values');
          }
        },
        get: function () {
          return cache || (cache = op(self.raw, from));
        }
      });

      return to;
    });

  };

  /**
   * (Re)run index/group/order procedures to create indices of
   * sub-objects.
   *
   * @return {undefined}
   */
  Registry.prototype._clearIndices = function () {
    var self = this;
    self._indexNames.forEach(function (name) {
      self[name] = CLEAR_CACHE;
    });
  };

  /**
   * Copy all array methods which have side-effects, and wrap them
   * in a function that will reindex after each call, as well
   * as duplex the operation to the .raw version of the Registry.
   *
   * @param  {[type]} method [description]
   * @return {[type]}        [description]
   */
  'pop push shift splice unshift reverse'.split(' ').forEach(function (method) {
    var orig = Array.prototype[method];

    Registry.prototype[method] = function (/* args... */) {
      // call the original method with this context
      orig.apply(this, arguments);

      // run the indexers
      this._clearIndices();

      // call the original method on our "raw" array, and return the result(s)
      return orig.apply(this.raw, arguments);
    };
  });

  /**
   * provide a hook for the JSON serializer
   * @return {array} - a plain, vanilla array with our same data
   */
  Registry.prototype.toJSON = function () {
    return this.raw;
  };

  return Registry;
});