# textadv.js

This is a JavaScript interactive fiction engine that is loosely based
on my understanding of Inform 6 and Inform 7.  The engine is meant to
be very extensible, using poor-man's generic function for all basic
functionality.  The world model is like Inform 7's, where an object is
merely its properties and relations to other objects (but we don't try
to derive a minimal first-order model given the description of the
world -- we cheat and use default values for properties!)

The library is a port of [textadv](https://github.com/kmill/textadv)
and it is a work in progress.
