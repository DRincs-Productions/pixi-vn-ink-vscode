// Comparing lists with >, <, >= and <=. These compare the numerical value of elements,
// not simple set containment.
LIST volumeLevel = off, quiet, medium, loud, deafening
VAR loudGroup = (loud, deafening)
VAR quietGroup = (off, quiet)

// "Distinctly bigger than": the smallest value in A is bigger than the largest value in B.
{ loudGroup > quietGroup: The loud group is distinctly louder than the quiet group. }

// "Definitely never smaller than": neither the min nor the max of A is below that of B.
{ loudGroup >= quietGroup: The loud group is never quieter than the quiet group. }

// Health warning! LIST_A >= LIST_B is *not* the same as LIST_A > LIST_B or LIST_A == LIST_B.

// Inverting lists: flips every entry to the opposite of what it was before.
LIST GuardsOnDuty = (Smith), (Jones), Carter, Braithwaite

=== function changingOfTheGuard
	~ GuardsOnDuty = LIST_INVERT(GuardsOnDuty)

// LIST_INVERT on an empty list returns null if there's not enough context to know what to
// invert. If you need to handle that case, it's safest to do it by hand:
=== function changingOfTheGuardSafely
	{!GuardsOnDuty: // "is GuardsOnDuty empty right now?"
		~ GuardsOnDuty = LIST_ALL(Smith)
	- else:
		~ GuardsOnDuty = LIST_INVERT(GuardsOnDuty)
	}

// Intersecting lists: the `^` operator gets the overlap between two lists.
LIST CoreValues = strength, courage, compassion, greed, nepotism, self_belief, delusions_of_godhood
VAR desiredValues = (strength, courage, compassion, self_belief )
VAR actualValues =  ( greed, nepotism, self_belief, delusions_of_godhood )

{desiredValues ^ actualValues} // prints "self_belief"

{desiredValues ^ actualValues: The new president has at least one desirable quality.}

{LIST_COUNT(desiredValues ^ actualValues) == 1: Correction, the new president has only one desirable quality. {desiredValues ^ actualValues == self_belief: It's the scary one.}}
