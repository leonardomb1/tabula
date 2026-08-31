# Builds both images from one graph so shared stages (deps, source copy) are
# computed once. Tags/labels come from docker/metadata-action bake files in CI.

target "docker-metadata-action" {}
target "docker-metadata-action-tools" {}

group "default" {
  targets = ["app", "tools"]
}

target "app" {
  inherits = ["docker-metadata-action"]
  context  = "."
  target   = "runtime"
}

target "tools" {
  inherits = ["docker-metadata-action-tools"]
  context  = "."
  target   = "tools"
}
