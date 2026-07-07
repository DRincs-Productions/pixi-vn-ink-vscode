// Lists are boolean sets: names in brackets are included in the initial state of the list.

// Maybe no one is in:
LIST DoctorsInSurgery = Adams, Bernard, Cartwright, Denver, Eamonn

// Maybe everyone is:
// LIST DoctorsInSurgery = (Adams), (Bernard), (Cartwright), (Denver), (Eamonn)

// Or maybe some are and some aren't:
// LIST DoctorsInSurgery = (Adams), Bernard, (Cartwright), Denver, Eamonn

// If you're defining your own values, brackets can go around the whole term or just the name:
LIST primeNumbers = (two = 2), (three) = 3, (five = 5)

// Assigning multiple values at once:
~ DoctorsInSurgery = (Adams, Bernard)
~ DoctorsInSurgery = (Adams, Bernard, Eamonn)

// Assigning the empty list clears a list out:
~ DoctorsInSurgery = ()

// Adding and removing entries, singly or collectively:
~ DoctorsInSurgery = DoctorsInSurgery + Adams
~ DoctorsInSurgery += Adams  // this is the same as the above
~ DoctorsInSurgery -= Eamonn
~ DoctorsInSurgery += (Eamonn, Denver)
~ DoctorsInSurgery -= (Adams, Eamonn, Denver)

// Basic Queries
{LIST_COUNT(DoctorsInSurgery)} 	//  "2"
{LIST_MIN(DoctorsInSurgery)} 		//  "Adams"
{LIST_MAX(DoctorsInSurgery)} 		//  "Cartwright"
{LIST_RANDOM(DoctorsInSurgery)} 	//  "Adams" or "Cartwright"

// Testing for emptiness
{ DoctorsInSurgery: The surgery is open today. | Everyone has gone home. }

// Testing for exact equality: == means 'set equality', all entries identical.
{ DoctorsInSurgery == (Adams, Bernard):
	Dr Adams and Dr Bernard are having a loud argument in one corner.
}
{ DoctorsInSurgery != (Adams, Bernard):
	At least Adams and Bernard aren't arguing.
}

// Testing for containment with `has`, otherwise known as `?`.
{ DoctorsInSurgery ? (Adams, Bernard):
	Dr Adams and Dr Bernard are having a hushed argument in one corner.
}
{ DoctorsInSurgery has Eamonn:
	Dr Eamonn is polishing his glasses.
}
// Negated with `hasnt` or `!?` (not `?`) - note this only means "not *both* present".
{ DoctorsInSurgery !? (Adams, Bernard):
	Not both Adams and Bernard are present right now.
}

// Warning: no list ever contains the empty list, so this is always false.
{ DoctorsInSurgery ? ():
	This line will never show.
}

// Example: basic knowledge tracking
LIST Facts = (Fogg_is_fairly_odd), first_name_phileas, (Fogg_is_English)

{Facts ? Fogg_is_fairly_odd:I smiled politely.|I frowned. Was he a lunatic?}
'{Facts ? first_name_phileas:Phileas|Monsieur}, really!' I cried.

{ Facts ? (Fogg_is_English, Fogg_is_fairly_odd):
	<> 'I know Englishmen are strange, but this is *incredible*!'
}

// Example: a doctor's surgery
-> waiting_room

=== function whos_in_today()
	In the surgery today are {DoctorsInSurgery}.

=== function doctorEnters(who)
	{ DoctorsInSurgery !? who:
		~ DoctorsInSurgery += who
		Dr {who} arrives in a fluster.
	}

=== function doctorLeaves(who)
	{ DoctorsInSurgery ? who:
		~ DoctorsInSurgery -= who
		Dr {who} leaves for lunch.
	}

=== waiting_room
	{whos_in_today()}
	*	[Time passes...]
		{doctorLeaves(Adams)} {doctorEnters(Cartwright)} {doctorEnters(Eamonn)}
		{whos_in_today()}
