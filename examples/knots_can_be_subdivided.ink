/**
 * The Orient Express
 */
=== the_orient_express ===
/**
 * The Orient Express is a famous long-distance passenger train service that originally ran from Paris to Istanbul. It is known for its luxurious accommodations and has been featured in various works of fiction, including Agatha Christie's novel
 */
= in_first_class
	...
= in_third_class
	...
= in_the_guards_van
	...
= missed_the_train
	...

* [Travel in third class]
	-> the_orient_express.in_first_class

* [Travel in the guard's van]
    -> the_orient_express.in_the_guards_van
