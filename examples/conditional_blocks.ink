VAR x = 1
VAR y = 0

{ x > 0:
	~ y = x - 1
}

{ x > 0:
	~ y = x - 1
- else:
	~ y = x + 1
}

{
	- x > 0:
		~ y = x - 1
	- else:
		~ y = x + 1
}

{
	- x == 0:
		~ y = 0
	- x > 0:
		~ y = x - 1
	- else:
		~ y = x + 1
}

