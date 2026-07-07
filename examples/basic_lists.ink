LIST volumeLevel = off, quiet, medium, loud, deafening
VAR lecturersVolume = quiet
VAR murmurersVolume = quiet

{ lecturersVolume < deafening:
	~ lecturersVolume++

	{ lecturersVolume > murmurersVolume:
		~ murmurersVolume++
		The murmuring gets louder.
	}
}

The lecturer's voice becomes {lecturersVolume}.

// Converting values to numbers: the first value in a list has the value 1, not 0.
The lecturer has {LIST_VALUE(deafening) - LIST_VALUE(lecturersVolume)} notches still available to him.

// Converting numbers to values: use the list's name as a function.
LIST Numbers = one, two, three
VAR score = one
~ score = Numbers(2) // score will be "two"

// Advanced: defining your own numerical values.
LIST primeNumbers = two = 2, three = 3, five = 5

// If you specify a value, but not the next value, ink will assume an increment of 1.
// So the line above is the same as:
// LIST primeNumbers = two = 2, three, five = 5
