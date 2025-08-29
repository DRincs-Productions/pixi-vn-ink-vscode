{ x:
- 0: 	zero
- 1: 	one
- 2: 	two
- else: lots
}


=== dream ===
	{
		- visited_snakes && not dream_about_snakes:
			~ fear++
			-> dream_about_snakes

		- visited_poland && not dream_about_polish_beer:
			~ fear--
			-> dream_about_polish_beer

		- else:
			// breakfast-based dreams have no effect
			-> dream_about_marmalade
	}


I stared at Monsieur Fogg.
{ know_about_wager:
	<> "But surely you are not serious?" I demanded.
- else:
	<> "But there must be a reason for this trip," I observed.
}
He said nothing in reply, merely considering his newspaper with as much thoroughness as entomologist considering his latest pinned addition.


{ door_open:
	* 	I strode out of the compartment[] and I fancied I heard my master quietly tutting to himself. 			-> go_outside
- else:
	*	I asked permission to leave[] and Monsieur Fogg looked surprised. 	-> open_door
	* 	I stood and went to open the door[]. Monsieur Fogg seemed untroubled by this small rebellion. -> open_door
}


