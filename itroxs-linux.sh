#!/bin/bash
while true; do
	./roon-extension-itroxs-linux check_updates
	if [ $? -eq 101 ] 
	then
		echo "restarting itroxs extension..."
		sleep 1
	else
		exit $?
	fi
done
