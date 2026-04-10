package queue

import "github.com/nats-io/nats.go"

// JobQueue abstracts the message broker used between the API and worker.
type JobQueue interface {
	PublishJob(job ScanJob) error
	PublishProgress(progress ScanProgress) error
	SubscribeJobs(handler func(ScanJob)) error
	SubscribeProgress(scanID string, handler func(ScanProgress)) (*nats.Subscription, error)
	Close()
}
