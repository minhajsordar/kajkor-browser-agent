
PIDS=$(lsof -ti tcp:4000); echo "killing: $PIDS"; [ -n "$PIDS" ] && kill -9 $PIDS; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

for p in $(lsof -ti tcp:4000); do echo "kill $p"; kill -9 "$p"; done; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

If you run backend server for your testing purpose, then before ending task you should close the server so that i can run it myself,