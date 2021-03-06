var base = require("./base-class"),
  _ = require("underscore")._,
  inherits = require("inherits"),
  isArray = Array.isArray;

module.exports = EventPublisher;

/**
 * Convert array-like object to an Array.
 *
 * node-bench: "16.5 times faster than Array.prototype.slice.call()"
 *
 * @param {Object} obj
 * @return {Array}
 * @api private
 */
function toArray(obj){
  var len = obj.length,
    arr = new Array(len);
  for (var i = 0; i < len; ++i) {
    arr[i] = obj[i];
  }
  return arr;
}

/**
 * @class TODO: Complete description
 * @param {Object} options
 */
function EventPublisher(options) {
  base.apply(this, arguments); //get our minimal base class stuff (i.e. id, dispose)
  EventPublisher.super.apply(this, arguments); //get the base node EventEmitter functionality
  
  //allow wiring events via the constructor
  if (options && (options.on || options.once)) {
    if (options.on) {
      for (var evt in options.on) {
        this.on(evt, options.on[evt]);
      }
    }                
    if (options.once) {
      for (var evt in options.once) {
        this.once(evt, options.once[evt]);
      }
    }
  }
};
/**
 * @param {String} type the name of the event to fire/emit.
 * @function
 * @name EventPublisher.prototype.fire
 */
/**
 * @param {String} type the name of the event to fire/emit.
 * @function
 */
EventPublisher.prototype.emit = EventPublisher.prototype.fire = function (type) {
  if (this._suppressAll
      || (this._suppressOnceEvents && this._suppressOnceEvents[type]) 
      || (this._suppressEvents && this._suppressEvents[type])) {
    
    if (this._suppressOnceEvents) {
      delete this._suppressOnceEvents[type];
    }
    //buffer events for re-emitting later if required
    if (this._bufferedEvents && (this._bufferedEvents[type] || this._bufferAll)) {
      this._buffer.push({type: type, args: toArray(arguments)});
    }
    return false;
  }

  //this is much better, and for now we'll keep it for convenience, but even this may eventually have to go for performance reasons,
  //and in that case we'd be forcing listening level code to manually manage cases where it cares who the sender is 
  var args = toArray(arguments);
  args.push(this);
  
  return EventPublisher.super.prototype.emit.apply(this, args);
};
/**
 * Registers a listener for an event.
 * @param {String} type - the event name to listen for
 * @param {Object} listener the listener to attach
 * @param {Object} disposable
 * @function
 * @name EventPublisher.prototype.on
 */
/**
 * Registers a listener for an event.
 * @param {String} type - the event name to listen for
 * @param {Object} listener the listener to attach
 * @param {Object} disposable
 * @function
 */
EventPublisher.prototype.addListener = EventPublisher.prototype.on = function (type, listener, disposable) {  
  //increase default "max listeners" setting for this higher level class
  if (!this._events) this._events = {};
  if (typeof this._events.maxListeners === "undefined") {
    this._events.maxListeners = 1000;
  }

  /*
   * auto cleanup functionality for disposable listeners
   */
  var me = this;
  if (disposable && typeof disposable.once === "function") {
    //NOTE: for the sake of this functionality, a "disposable" is an object that's expected to fire a "disposed" event when being disposed
    //this allows you to pass in an object that may dispose and have the event handler cleanup be done
    //automatically for you.
    disposable.once("disposed", function() {
      me.removeListener(type, listener);
    });
  }

  return EventPublisher.super.prototype.on.apply(this, arguments);
};
/**
 * convenience method for attaching one-time listeners
 * @param {String} type - the event name to listen for
 * @param {Object} listener the listener to attach
 * @param {Object} disposable 
 */
EventPublisher.prototype.once = function(type, listener, disposable) {
  var me = this;
  var cb = listener;
  listener = function() {
    me.removeListener(type, listener);
    cb.apply(arguments.callee, arguments);
  };
  return this.on(type, listener, disposable);
};

/**
 * allow events to be suppressed by event type, and optionally buffered for re-emitting after unsuppression
 * pass null or nothing in for type param to indicate that all events should be suppressed
 * note: if suppressing all events, the only way to unsuppress any events is to unsuppress them all.
 * In other words, I'm doing no internal tracking/checking of "unsuppressed" event names against all possible events if _suppressAll is true 
 * (this is so the logic can remain fairly light; i.e. some edge cases are not currently supported)
 * @param {String | String[]} type - the event name to suppress, or an array of event names to suppress
 * @param {Boolean} buffer - flag to indicate whether the suppressed events should be buffered for re-emission after unsuppress
 * @param {Boolean} once - flag to indicate whether the event(s) should only be suppressed one time
 */
EventPublisher.prototype.suppress = function(type, buffer, once) {
  this._suppressEvents = this._suppressEvents || {};
  this._suppressOnceEvents = this._suppressOnceEvents || {};
  var suppressionTarget = once ? this._suppressOnceEvents : this._suppressEvents;
  //instance level queue for all events so re-firing mixed suppressed events can be in the original order
  buffer && (this._buffer = this._buffer || []);
  //state object to track events that should be buffered
  buffer && (this._bufferedEvents = this._bufferedEvents || {});
  if (typeof type === "undefined" || type === null) {
    this._suppressAll = true;
    buffer && (this._bufferAll = true);
  } else {
    if (isArray(type)) {
      for (var i = 0, l = type.length; i < l; i++) {
        suppressionTarget[type[i]] = true;
        buffer && (this._bufferedEvents[type[i]] = true);
      }
    } else {
      suppressionTarget[type] = true;
      buffer && (this._bufferedEvents[type] = true);
    }
  }  
};

/**
 * convenience alias for suppressing events one time
 * @param {String | String[]} type - the event name to suppress, or an array of event names to suppress
 * @param {Boolean} buffer - flag to indicate whether the suppressed events should be buffered for re-emission after unsuppress
 */
EventPublisher.prototype.suppressOnce = function(type, buffer) {
  this.suppress(type, buffer, true);
};

/**
 * un-suppress events by event type, optionally re-emitting any buffered events in the process
 * @param {String | String[]} type - the event name to un-suppress, or an array of event names to un-suppress
 * @param {Boolean} bypassRefiring - flag to indicate whether buffered events should be re-emitted or not (true means events are NOT re-emitted. defaults to false)
 */
EventPublisher.prototype.unsuppress = function(type, bypassRefiring) {
  //sanity assignments of the state objects to defend against case where .unsuppress is called before .suppress is ever called
  this._suppressEvents = this._suppressEvents || {};
  this._suppressOnceEvents = this._suppressOnceEvents || {};
  bypassRefiring = !!bypassRefiring; //normalize to proper bool
  var unsuppressAll = (typeof type === "undefined" || type === null);
  if (unsuppressAll) {
    //reset/remove all state flags
    this._suppressAll = false;
    this._bufferAll = false;
    delete this._suppressEvents;
    delete this._suppressOnceEvents;
    delete this._bufferedEvents;    
  } else if (!this._suppressAll) {
    //normalize type to an array
    type = isArray(type) ? type : [type];
    var currType;
    for (var i = 0, l = type.length; i < l; i++) {
      currType = type[i];
      delete this._suppressEvents[currType];
      delete this._suppressOnceEvents[currType]; 
      if (bypassRefiring && this._buffer) {
        this._buffer = _.filter(function(bufferEvent) {
          return bufferEvent.type !== currType;
        });
      }     
    }    
  } else {
    //if we're currently suppressing all events, and .unsuppress is called with a granular event name or event list,
    //since we're not supporting this case (see comments for .suppress method), throw an error to alert
    //the developer that this is not a supported case currently and they should change their code.
    throw new Error("Cannot unsuppress a subset of events when the EventPublisher is currenly suppressing ALL events. Please change this call to unsuppress all events by passing either nothing or null in as the first argument.");
  }

  //if we got this far, now re-emit all appropriate buffered events
  if (!bypassRefiring && this._buffer) {
    //do the loop thing
    var currEvent,
        length = this._buffer.length, //cache original length so we can stop the loop at the right spot if events get re-queued (which is possible for some supported cases)
        index = 0,
        offset = 0,
        mismatches = {}, //a cache to index mismatching types to minimize .indexOf lookups in the loop
        matches = {}; //a cache to index the types after first matching lookup to minimize .indexOf calls in the loop
    while (this._buffer && index < length) {
      if (this._buffer.length > 0) {
        currEvent = this._buffer[offset];
        //re-emit the event if type matches one of the passed in types or if we're unsuppressing all
        //note: even though suppress could be re-called during this process,
        //we'll go through the whole loop (up to the original length of the buffer)
        //this supports the case where a subset of events are re-suppressed and some of them are not
        if (!mismatches[currEvent.type] 
            && (unsuppressAll 
                || matches[currEvent.type] 
                || type.indexOf(currEvent.type) > -1)) {
          //cache this type to avoid an indexOf lookup next time the same type is checked
          matches[currEvent.type] = true;
          //take it out of the buffer
          this._buffer.splice(offset, 1);          
          //finally, re-emit unless told not to at the call level
          !bypassRefiring && this.fire.apply(this, currEvent.args);
        } else {
          //mark this event type as a mismatch to avoid unneccesary lookup/checks next time one is found
          mismatches[currEvent.type] = true;
          offset++;
        }
        if (this._buffer.length == 0) delete this._buffer;
        index++;
      } else {
        delete this._buffer;
      }
    }
  }
};

/**
 * Disposes of all listeners and fires "disposed" event before calling super.dispose.
 */
EventPublisher.prototype.dispose = function() {
  this.fire("disposed");
  this.removeAllListeners();
  base.prototype.dispose.apply(this, arguments);
};

inherits(EventPublisher, process.EventEmitter);
