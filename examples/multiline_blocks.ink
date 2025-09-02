// Sequence: go through the alternatives, and stick on last
{ stopping:
	-	I entered the casino.
	-  I entered the casino again.
	-  Once more, I went inside.
}

// Shuffle: show one at random
At the table, I drew a card. <>
{ shuffle:
	- 	Ace of Hearts.
	- 	King of Spades.
	- 	2 of Diamonds.
		'You lose this time!' crowed the croupier.
}

// Cycle: show each in turn, and then cycle
{  cycle:
	- I held my breath.
	- I waited impatiently.
	- I paused.
}

// Once: show each, once, in turn, until all have been shown
{once:
	- Would my luck hold?
	- Could I win the hand?
}



{ shuffle once:
-	The sun was hot.
- 	It was a hot day.
}


{ shuffle stopping:
- 	A silver BMW roars past.
-	A bright yellow Mustang takes the turn.
- 	There are like, cars, here.
}


