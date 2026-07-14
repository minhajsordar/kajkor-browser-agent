Update project design structure in PROJECT_STRUCTURE.md


navigate → click "What's on your mind" → generate_text (prompt: "Write a post about how we can survive in the AI era") → stop.


PIDS=$(lsof -ti tcp:4000); echo "killing: $PIDS"; [ -n "$PIDS" ] && kill -9 $PIDS; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

for p in $(lsof -ti tcp:4000); do echo "kill $p"; kill -9 "$p"; done; sleep 1; (nc -z localhost 4000 2>/dev/null && echo "still up" || echo "port 4000 free")

If you run backend server for your testing purpose, then before ending task you should close the server so that i can run it myself,

- When teaching skill we select an element from the page, we also need to be able to select it's parent/anchestor container from the skill panel, we should have a button one for anchestor selection, why we need this? we need this because some time the ui is too narrow to select exact element. if user think he could not select the expected element he can just use that button to select from it's anchestors.