# sleeper-duck-duck-goose
An app that defines one goose, and n amount of ducks

Based the high level voting architecture and tie breaker concepts on this: (medium article around consensus algorithm's within mongodb and couchdb)[https://medium.com/geekculture/raft-consensus-algorithm-and-leader-election-in-mongodb-vs-coachroachdb-19b767c87f95]


## Prerequisites

In order to run this application a local redis server is required.

Run `npm start` after running redis locally on the default port

## Design Explanation

When going through with this I wanted to create a somehow decentralized solution to create something that could truly be scalable horizontally. I could have relied on restful http connections to communicate but decided using some type of low level UDP port communication would be more effective and similar to how infrastructure monitoring tools work.

The concept of primary and secondary servers reminded me of how mongo or other noSQL Db's handle traffic and my solution would implement a voting system in order to properly

The only centralized system used in this service is redis, and is strictly utilized to initial pull in the last known active primary/parent's host address, in order to avoid having to launch with configuration info as a pre-req.

The primary therefor then acts as a TCP server that child processes can connect to.

Children then ping a `heartbeat` message out to the primary server, the primary server will then emit a `healthInfo` event providing the information of active servers as well as their Eelection `UDP4` port information.

When a child hasn't heard a healthInfo response from the primary after 2 heartbeats, it's considered a full disconnect and triggers an election for the new primary.

Using the information from the last known health event, the server will go around soliciting votes for that election (terms are kept track of), the server with the most recent `lastHeartBeat` to the primary is used as a tie breaker.

This design is somewhat complex but creates a near fully decentralized communication system for the servers within a group of nodes.

Each server is represented by a UUID, and has 3 ports open. [1 port for an express rest server to check duck or goose, 1 port for parent/child socket communication, 1 port to hold elections]

As a result of this being so low level and utilizing ipc communication, setInterval's are used to check for ack'd messages.

A more seamlessly way to do this would be with a central queue system as the form of communication between nodes, however I personally wanted to minimize the use of 3rd party dependencies.

## Limitations

The implementation as a result of a reliance on class values and loops rather than 2-way message response, it feels more brittle.

Not using the exported singleton's within these ipc classes makes things slightly messier as within the handler file coordination needs to happen. Rather than directly calling a function on the singleton,
the function is dependency injected into the constructor. This allows for more isolated unit testing, and clean separation of concerns but makes the code look more verbose.

The network partition logic should most likely take place in the election IPC rather than the parent IPC
