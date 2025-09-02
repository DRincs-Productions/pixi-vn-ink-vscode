*	{ not visit_paris } 	[Go to Paris] -> visit_paris
+ 	{ visit_paris 	 } 		[Return to Paris] -> visit_paris
*	{ visit_paris.met_estelle } [ Telephone Mme Estelle ] -> phone_estelle
*	{ not visit_paris } 	[Go to Paris] -> visit_paris
+{ visit_paris } { not bored_of_paris }
	[Return to Paris] -> visit_paris
*	{ not (visit_paris or visit_rome) && (visit_london || visit_new_york) } [ Wait. Go where? I'm confused. ] -> visit_someplace

=== visit_paris ===
-> DONE

= met_estelle
-> DONE

=== phone_estelle ===
-> DONE

VAR bored_of_paris = false
VAR visit_rome = false
VAR visit_london = false
VAR visit_new_york = false

=== visit_someplace ===
-> DONE