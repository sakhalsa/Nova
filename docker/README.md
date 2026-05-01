# AIEI Docker

Run AIEI scoring in any environment. No Node.js installation required.

## Build

```bash
docker build -f docker/Dockerfile -t postman/aiei .
```

## Usage

```bash
# Score with environment file
docker run -v $(pwd)/my-env.json:/app/env.json postman/aiei score --env /app/env.json

# Score with shell environment variables
docker run \
  -e GITHUB_TOKEN=ghp_xxx \
  -e OPENAI_API_KEY=sk-xxx \
  -e POSTMAN_API_KEY=PMAK-xxx \
  postman/aiei score --env /app/collection/AIEI_Environment_Template.postman_environment.json

# Generate HTML report
docker run -v $(pwd):/output postman/aiei report --env /app/env.json --format html --output /output/report.html

# Interactive setup
docker run -it -v $(pwd):/output postman/aiei setup --output /output/aiei-env.json
```

## Docker Compose (for recurring scoring)

```yaml
services:
  aiei:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    env_file: .env
    volumes:
      - ./reports:/output
    command: ["score", "--env", "/app/env.json", "--output", "json"]
```
