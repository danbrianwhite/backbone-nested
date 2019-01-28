var equal, isObject;
/* jshint ignore:start*/

//https://raw.githubusercontent.com/epoberezkin/fast-deep-equal/master/index.js
var isArray = Array.isArray;
var keyList = Object.keys;
var hasProp = Object.prototype.hasOwnProperty;

equal = function(a, b) { if (a === b) return true; if (a && b && typeof a == 'object' && typeof b == 'object') { var arrA = isArray(a) , arrB = isArray(b) , i , length , key; if (arrA && arrB) { length = a.length; if (length != b.length) return false; for (i = length; i-- !== 0;) if (!equal(a[i], b[i])) return false; return true; } if (arrA != arrB) return false; var dateA = a instanceof Date , dateB = b instanceof Date; if (dateA != dateB) return false; if (dateA && dateB) return a.getTime() == b.getTime(); var regexpA = a instanceof RegExp , regexpB = b instanceof RegExp; if (regexpA != regexpB) return false; if (regexpA && regexpB) return a.toString() == b.toString(); var keys = keyList(a); length = keys.length; if (length !== keyList(b).length) return false; for (i = length; i-- !== 0;) if (!hasProp.call(b, keys[i])) return false; for (i = length; i-- !== 0;) { key = keys[i]; if (!equal(a[key], b[key])) return false; } return true; } return a!==a && b!==b; };


isObject = function (obj) {
    return obj === Object(obj);
};
/* jshint ignore:end */

/**
 * Backbone-Nested 2.0.4 - An extension of Backbone.js that keeps track of nested attributes
 *
 * http://afeld.github.com/backbone-nested/
 * http://danbrianwhite.github.com/backbone-nested/
 *
 * Copyright (c) 2011-2019 Aidan Feldman && Daniel White
 * MIT Licensed (LICENSE)
 */

/*global define, require, module */
(function (root, factory) {
    if (typeof exports !== 'undefined') {
        // Define as CommonJS export:
        module.exports = factory(require('underscore'), require('backbone'));
    } else if (typeof define === 'function' && define.amd) {
        // Define as AMD:
        define(['underscore', 'backbone'], factory);
    } else {
        // Just run it:
        factory(root._, root.Backbone);
    }
}(this, function (_, Backbone) {
    'use strict';

    var splitRegex = /\.|\[|\]/g;

    Backbone.NestedModel = Backbone.Model.extend({

        get: function (attrStrOrPath) {
            return Backbone.NestedModel.walkThenGet(this.attributes, attrStrOrPath);
        },

        previous: function (attrStrOrPath) {
            return Backbone.NestedModel.walkThenGet(this._previousAttributes, attrStrOrPath);
        },

        has: function (attr) {
            // for some reason this is not how Backbone.Model is implemented - it accesses the attributes object directly
            var result = this.get(attr);
            return !(result === null || typeof result === 'undefined');
        },

        set: function (key, value, opts) {
            var newAttrs = Backbone.NestedModel.deepClone(this.attributes),
                attrPath,
                unsetObj,
                validated;

            if (typeof key === 'string') {
                // Backbone 0.9.0+ syntax: `model.set(key, val)` - convert the key to an attribute path
                attrPath = Backbone.NestedModel.attrPath(key);
            } else if (Array.isArray(key)) {
                // attribute path
                attrPath = key;
            }

            if (attrPath) {
                opts = opts || {};
                this._setAttr(newAttrs, attrPath, value, opts);
            } else { // it's an Object
                opts = value || {};
                var attrs = key;
                for (var _attrStr in attrs) {
                    if (attrs.hasOwnProperty(_attrStr)) {
                        this._setAttr(newAttrs,
                            Backbone.NestedModel.attrPath(_attrStr),
                            opts.unset ? void 0 : attrs[_attrStr],
                            opts);
                    }
                }
            }

            this._nestedChanges = Backbone.NestedModel.__super__.changedAttributes.call(this);

            if (opts.unset && attrPath && attrPath.length === 1) { // assume it is a singular attribute being unset
                // unsetting top-level attribute
                unsetObj = {};
                unsetObj[key] = void 0;
                this._nestedChanges = _.omit(this._nestedChanges, Object.keys(unsetObj));
                validated = Backbone.NestedModel.__super__.set.call(this, unsetObj, opts);
            } else {
                unsetObj = newAttrs;

                // normal set(), or an unset of nested attribute
                if (opts.unset && attrPath) {
                    // make sure Backbone.Model won't unset the top-level attribute
                    opts = Object.assign({}, opts);
                    delete opts.unset;
                } else if (opts.unset && isObject(key)) {
                    unsetObj = key;
                }
                this._nestedChanges = _.omit(this._nestedChanges, Object.keys(unsetObj));
                validated = Backbone.NestedModel.__super__.set.call(this, unsetObj, opts);
            }


            if (!validated) {
                // reset changed attributes
                this.changed = {};
                this._nestedChanges = {};
                return false;
            }


            this._runDelayedTriggers();
            return this;
        },

        unset: function (attr, options) {
            return this.set(attr, void 0, Object.assign({}, options, {unset: true}));
        },

        clear: function (options) {
            this._nestedChanges = {};

            // Mostly taken from Backbone.Model.set, modified to work for NestedModel.
            options = options || {};
            // clone attributes so validate method can't mutate it from underneath us.
            var attrs = this.deepClone(this.attributes);
            if (!options.silent && this.validate && !this.validate(attrs, options)) {
                return false; // Should maybe return this instead?
            }

            var changed = this.changed = {};
            var model = this;

            var setChanged = function (obj, prefix, options) {
                // obj will be an Array or an Object
                var isArray = Array.isArray(obj);
                var objKeys = isArray ? null : Object.keys(obj);
                var length = isArray ? obj.length : objKeys.length;

                for (var i = 0; i < length; i++) {
                    var attr = isArray ? i : objKeys[i];
                    var changedPath = prefix;
                    if (isArray) {
                        // assume there is a prefix
                        changedPath += '[' + attr + ']';
                    } else if (prefix) {
                        changedPath += '.' + attr;
                    } else {
                        changedPath = attr;
                    }

                    var val = obj[attr];
                    if (isObject(val)) { // clear child attrs
                        setChanged(val, changedPath, options);
                    }
                    if (!options.silent) {
                        model._delayedChange(changedPath, null, options);
                    }
                    changed[changedPath] = null;
                }
            };
            setChanged(this.attributes, '', options);

            this.attributes = {};

            // Fire the `"change"` events.
            if (!options.silent) {
                this._delayedTrigger('change');
            }

            this._runDelayedTriggers();
            return this;
        },

        add: function (attrStr, value, opts) {
            var current = this.get(attrStr);
            if (!Array.isArray(current)) {
                throw new Error('current value is not an array');
            }
            return this.set(attrStr + '[' + current.length + ']', value, opts);
        },

        remove: function (attrStr, opts) {
            opts = opts || {};

            var attrPath = Backbone.NestedModel.attrPath(attrStr),
                aryPath = _.initial(attrPath),
                val = this.get(aryPath),
                i = attrPath[attrPath.length - 1];

            if (!Array.isArray(val)) {
                throw new Error('remove() must be called on a nested array');
            }

            // only trigger if an element is actually being removed
            var trigger = !opts.silent && (val.length >= i + 1),
                oldEl = val[i];

            // remove the element from the array
            val.splice(i, 1);
            opts.silent = true; // Triggers should only be fired in trigger section below
            this.set(aryPath, val, opts);

            if (trigger) {
                attrStr = Backbone.NestedModel.createAttrStr(aryPath);
                this.trigger('remove:' + attrStr, this, oldEl);
                for (var aryCount = aryPath.length; aryCount >= 1; aryCount--) {
                    attrStr = Backbone.NestedModel.createAttrStr(_.first(aryPath, aryCount));
                    this.trigger('change:' + attrStr, this, oldEl);
                }
                this.trigger('change', this, oldEl);
            }

            return this;
        },

        changedAttributes: function (diff) {
            var backboneChanged = Backbone.NestedModel.__super__.changedAttributes.call(this, diff);
            if (isObject(backboneChanged)) {
                return Object.assign({}, this._nestedChanges, backboneChanged);
            }
            return false;
        },

        toJSON: function () {
            return Backbone.NestedModel.deepClone(this.attributes);
        },


        // private
        _getDelayedTriggers: function () {
            if (typeof this._delayedTriggers === 'undefined') {
                this._delayedTriggers = [];
            }
            return this._delayedTriggers;
        },
        _clearDelayedTriggers: function () {
            this._delayedTriggers = [];
        },
        _delayedTrigger: function (/* the trigger args */) {
            this._getDelayedTriggers()
                .push(arguments);
        },

        _delayedChange: function (attrStr, newVal, options) {
            this._delayedTrigger('change:' + attrStr, this, newVal, options);

            // Check if `change` even *exists*, as it won't when the model is
            // freshly created.
            if (!this.changed) {
                this.changed = {};
            }

            this.changed[attrStr] = newVal;
        },

        _runDelayedTriggers: function () {
            var delayedTriggers = this._getDelayedTriggers();
            var length = delayedTriggers.length;
            for (var i = length - 1; i >= 0; i--) {
                this.trigger.apply(this, delayedTriggers[i]);
            }
            this._clearDelayedTriggers();
        },

        // note: modifies `newAttrs`
        _setAttr: function (newAttrs, attrPath, newValue, opts) {
            opts = opts || {};

            var fullPathLength = attrPath.length;
            var model = this;

            Backbone.NestedModel.walkPath(newAttrs, attrPath, function (val, path, next) {
                var attr = _.last(path);
                var attrStr = Backbone.NestedModel.createAttrStr(path);

                // See if this is a new value being set
                var isNewValue = !equal(val[attr], newValue);

                if (path.length === fullPathLength) {
                    // reached the attribute to be set

                    if (opts.unset) {
                        // unset the value
                        delete val[attr];

                        // Trigger Remove Event if array being set to null
                        if (Array.isArray(val)) {
                            var parentPath = Backbone.NestedModel.createAttrStr(_.initial(attrPath));
                            model._delayedTrigger('remove:' + parentPath, model, val[attr]);
                        }
                    } else {
                        // Set the new value
                        val[attr] = newValue;
                    }

                    // Trigger Change Event if new values are being set
                    if (!opts.silent && isObject(newValue) && isNewValue) {
                        var visited = [];
                        var checkChanges = function (obj, prefix) {
                            // Don't choke on circular references
                            if (visited.indexOf(obj) > -1) {
                                return;
                            } else {
                                visited.push(obj);
                            }

                            var nestedAttr,
                                nestedVal;
                            for (var a in obj) {
                                if (obj.hasOwnProperty(a)) {
                                    nestedAttr = prefix + '.' + a;
                                    nestedVal = obj[a];
                                    if (!equal(model.get(nestedAttr), nestedVal)) {
                                        model._delayedChange(nestedAttr, nestedVal, opts);
                                    }
                                    if (isObject(nestedVal)) {
                                        checkChanges(nestedVal, nestedAttr);
                                    }
                                }
                            }
                        };
                        checkChanges(newValue, attrStr);

                    }


                } else if (!val[attr]) {
                    if (!isNaN(next)) {
                        val[attr] = [];
                    } else {
                        val[attr] = {};
                    }
                }

                if (!opts.silent) {
                    // let the superclass handle change events for top-level attributes
                    if (path.length > 1 && isNewValue) {
                        model._delayedChange(attrStr, val[attr], opts);
                    }

                    if (Array.isArray(val[attr])) {
                        model._delayedTrigger('add:' + attrStr, model, val[attr]);
                    }
                }
            });
        }

    }, {
        // class methods

        attrPath: function (attrStrOrPath) {
            var path;

            if (typeof attrStrOrPath === 'string') {
                path = (attrStrOrPath === '') ? [''] : attrStrOrPath.split(splitRegex);
                path = path.map(function (val) {
                    // convert array accessors to numbers
                    return isNaN(val) ? val : parseInt(val, 10);
                });
            } else {
                path = attrStrOrPath;
            }

            return path;
        },

        createAttrStr: function (attrPath) {
            var attrStr = attrPath[0];

            for (var i = 1; i < attrPath.length; i++) {
                var attr = attrPath[i];
                attrStr += !isNaN(attr) ? ('[' + attr + ']') : ('.' + attr);
            }

            return attrStr;
        },

        deepClone: function (obj) {
            return JSON.parse(JSON.stringify(obj));
        },

        walkPath: function (obj, attrPath, callback, scope) {
            var val = obj,
                childAttr;

            // walk through the child attributes
            for (var i = 0; i < attrPath.length; i++) {
                callback.call(scope || this, val, attrPath.slice(0, i + 1), attrPath[i + 1]);

                childAttr = attrPath[i];
                val = val[childAttr];
                if (!val) {
                    break; // at the leaf
                }
            }
        },

        walkThenGet: function (attributes, attrStrOrPath) {
            var attrPath = Backbone.NestedModel.attrPath(attrStrOrPath),
                result;

            Backbone.NestedModel.walkPath(attributes, attrPath, function (val, path) {
                var attr = path[path.length - 1];
                if (path.length === attrPath.length) {
                    // attribute found
                    result = val[attr];
                }
            });

            return result;
        }

    });

    return Backbone;
}));
