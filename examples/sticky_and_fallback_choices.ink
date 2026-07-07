=== find_help ===

	You search desperately for a friendly face in the crowd.
	*	The woman in the hat[?] pushes you roughly aside. -> find_help
	*	The man with the briefcase[?] looks disgusted as you stumble past him. -> find_help
	*	->
		But it is too late: you collapse onto the station platform. This is the end.
		-> END


=== homers_couch ===
	+	[Eat another donut]
		You eat another donut. -> homers_couch
	*	[Get off the couch]
		You struggle up off the couch to go and compose epic poetry.
		-> END

=== conversation_loop
	*	[Talk about the weather] -> chat_weather
	*	[Talk about the children] -> chat_children
	+	-> sit_in_silence_again
