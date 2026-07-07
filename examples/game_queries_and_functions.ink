-> game_queries_and_functions

=== game_queries_and_functions ===
	*	{false} Option A
	*	{true} Option B
	*	{CHOICE_COUNT() == 1} Option C
	-	This is turn number {TURNS()}.

	{TURNS_SINCE(-> sleeping) == -1:You've never felt sleepy here before.|You dozed off earlier.}
	{TURNS_SINCE(-> laugh) == -1:Nothing so funny has happened yet.|You already had a laugh.}

	-> came_from_example

=== sleeping ===
	You doze off for a moment.
	-> DONE

=== laugh ===
	You burst out laughing.
	-> DONE

=== function came_from(-> x)
	~ return TURNS_SINCE(x) == 0

=== came_from_example ===
	{came_from(-> nice_welcome): I'm happy to be here!|}
	{came_from(-> nasty_welcome): Let's keep this quick.|}
	-> nice_welcome

=== nice_welcome ===
	'Welcome!' they said warmly.
	-> maths_and_random

=== nasty_welcome ===
	'Oh, it's you,' they muttered.
	-> maths_and_random

=== maths_and_random ===
	~ SEED_RANDOM(235)

	~ temp dice_roll = RANDOM(1, 6)
	~ temp lazy_grading_for_test_paper = RANDOM(30, 75)
	~ temp number_of_heads_the_serpent_has = RANDOM(3, 8)

	{POW(3, 2)} is 9.
	{POW(16, 0.5)} is 4.

	{INT(3.2)} is 3.
	{FLOOR(4.8)} is 4.
	{INT(-4.8)} is -4.
	{FLOOR(-4.8)} is -5.

	{FLOAT(4)} is, um, still 4.

	-> list_functions

=== list_functions ===
	LIST DoctorsInSurgery = Adams, Bernard, (Cartwright), (Denver), Eamonn

	{LIST_COUNT(DoctorsInSurgery)} 	//  "2"
	{LIST_MIN(DoctorsInSurgery)} 		//  "Adams"
	{LIST_MAX(DoctorsInSurgery)} 		//  "Cartwright"
	{LIST_RANDOM(DoctorsInSurgery)} 	//  "Adams" or "Cartwright"

	{LIST_ALL(DoctorsInSurgery)} // Adams, Bernard, Cartwright, Denver, Eamonn
	{LIST_COUNT(LIST_ALL(DoctorsInSurgery))} // "5"

	LIST VolumeLevels = quiet, normal, loud, deafening
	VAR lecturersVolume = normal

	The lecturer has {LIST_VALUE(deafening) - LIST_VALUE(lecturersVolume)} notches still available to him.

	{LIST_RANGE(LIST_ALL(VolumeLevels), 2, 4)}

	LIST Guards = Smith, Jones, Baker, Cook
	VAR GuardsOnDuty = (Smith, Jones)

	~ GuardsOnDuty = LIST_INVERT(GuardsOnDuty)
	{GuardsOnDuty} // Baker, Cook

	-> END
