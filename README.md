# Synchronized Entity Store (SES)

object-safe, easily synchronizable entity store with request events

### Raison d'etre
Any object can store values.  And a Map can store values keyed to objects.  But what if you want to....

- Have your store synchronized with multiple data sources?
- Request objects that don't exist, and have those values automatically requested for you and returned?
- Automatically track the age of any given value? (TODO)
- Add event triggers that fire when datastore events happen?
- Manage the granularity or frequency of ```.on("change")``` events for different tree locations?

### TODO
- Make sure incoming values request store doesn't build up 
- Document
- Push to NPM



