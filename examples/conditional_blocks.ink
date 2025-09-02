VAR x = 1
VAR y = 0

{ - x > 0:
	Text
	~ y = x - 1
}

{ x > 0:
	~ y = x - 1
- else:
	Text
	~ y = x + 1
}

{
	- x > 0:
		Text
		~ y = x - 1
	- else:
		Text
		~ y = x + 1
}

{
	- x == 0:
		Text
		~ y = 0
	- x > 0:
		Text
		~ y = x - 1
	- else:
		Text
		~ y = x + 1
}

