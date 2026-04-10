package tools

import (
	"bufio"
	"os"
	"strings"
)

var BuiltinUsernames = []string{
	"admin", "root", "user", "test", "guest", "info", "adm", "mysql", "oracle",
	"ftp", "pi", "puppet", "ansible", "ec2-user", "vagrant", "azureuser",
	"administrator", "manager", "operator", "supervisor", "sysadmin",
	"webmaster", "postmaster", "hostmaster", "support", "service",
	"deploy", "jenkins", "git", "svn", "www", "web", "http", "nginx", "apache",
	"tomcat", "postgres", "mongo", "redis", "elastic", "kibana", "grafana",
	"nagios", "zabbix", "backup", "ftpuser", "www-data", "nobody",
	"demo", "sample", "default", "temp", "tmp", "dev", "developer",
	"staging", "production", "qa", "testing", "debug",
	"user1", "user2", "admin1", "admin2", "test1", "test2",
	"server", "system", "daemon", "bin", "sys", "sync", "proxy",
	"mail", "news", "uucp", "games", "man", "lp", "irc",
	"ubuntu", "centos", "debian", "fedora", "alpine", "docker",
	"terraform", "consul", "vault", "nomad",
	"api", "app", "application", "backend", "frontend",
	"monitoring", "logging", "metrics", "alerting", "security",
	"database", "db", "sql", "cache", "queue", "worker",
	"john", "jane", "bob", "alice", "charlie",
}

var BuiltinPasswords = []string{
	"admin", "password", "123456", "12345678", "root", "toor", "pass",
	"test", "guest", "master", "changeme", "1234", "12345", "123456789",
	"1234567890", "qwerty", "abc123", "password1", "iloveyou", "sunshine",
	"princess", "welcome", "shadow", "superman", "michael", "football",
	"baseball", "trustno1", "letmein", "dragon", "monkey", "mustang",
	"access", "passw0rd",
	"654321", "joshua", "maggie", "starwars", "silver", "william",
	"dallas", "yankees", "hello", "amanda", "charlie", "robert",
	"thomas", "hockey", "ranger", "daniel", "pepper", "qwerty123",
	"default", "secret", "login", "p@ssw0rd", "P@ssword1", "Password1",
	"Admin123", "Admin@123", "Root123", "root123", "test123", "Test123",
	"user123", "User123", "guest123", "Guest123",
	"password123", "Password123", "p@ss1234", "qwerty1234",
	"1q2w3e4r", "1qaz2wsx", "zaq12wsx",
	"administrator", "letmein123", "welcome1", "welcome123",
	"monkey123", "dragon123", "shadow123", "master123",
	"abc1234", "abcdef", "abcd1234", "pass1234", "pass123",
	"Pa$$w0rd", "r00t", "toor123", "admin1234", "root1234",
	"server", "oracle", "mysql", "postgres", "redis",
	"ftp123", "ssh123", "web123", "app123", "api123",
}

func LoadWordlistFile(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var entries []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line != "" && !strings.HasPrefix(line, "#") {
			entries = append(entries, line)
		}
	}
	return entries, scanner.Err()
}
