import { NodeRuntime } from "@effect/platform-node"
import { Layer } from "effect"
import { ServerLive } from "@fin/server"

NodeRuntime.runMain(Layer.launch(ServerLive))
