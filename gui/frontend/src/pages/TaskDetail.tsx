import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, Descriptions, Badge, Button, Typography, Spin, Space } from "antd";
import { ArrowLeftOutlined, StopOutlined } from "@ant-design/icons";
import { getTask, stopTask } from "@/utils/api";
import type { TaskStatus } from "@/types/task";

const { Text } = Typography;

const STATUS_MAP: Record<
  string,
  { status: "success" | "processing" | "error" | "default" | "warning"; text: string }
> = {
  running: { status: "processing", text: "运行中" },
  completed: { status: "success", text: "已完成" },
  failed: { status: "error", text: "失败" },
  stopped: { status: "warning", text: "已停止" },
  pending: { status: "default", text: "等待中" },
};

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getTask(id)
      .then(setTask)
      .catch(() => {
        // Backend not available
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleStop = async () => {
    if (!id) return;
    try {
      await stopTask(id);
      const updated = await getTask(id);
      setTask(updated);
    } catch {
      // Ignore
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <Text style={{ color: "rgba(255,255,255,0.45)" }}>
          任务未找到或后端服务不可用
        </Text>
      </div>
    );
  }

  const statusMeta = STATUS_MAP[task.status] ?? {
    status: "default" as const,
    text: task.status,
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <Space style={{ marginBottom: 16 }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate("/tasks")}
        >
          返回列表
        </Button>
        {task.status === "running" && (
          <Button danger icon={<StopOutlined />} onClick={handleStop}>
            停止任务
          </Button>
        )}
      </Space>

      <Card
        title="任务详情"
        style={{ background: "#1f1f1f", borderColor: "#303030", marginBottom: 16 }}
      >
        <Descriptions column={1} colon={false}>
          <Descriptions.Item label="任务 ID">
            <Text copyable style={{ color: "rgba(255,255,255,0.85)" }}>
              {task.id}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="名称">
            <Text style={{ color: "rgba(255,255,255,0.85)" }}>
              {task.name}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            <Badge status={statusMeta.status} text={statusMeta.text} />
          </Descriptions.Item>
          <Descriptions.Item label="模板">
            <Text style={{ color: "rgba(255,255,255,0.65)" }}>
              {task.template_id ?? "—"}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">
            <Text style={{ color: "rgba(255,255,255,0.65)" }}>
              {task.started_at
                ? new Date(task.started_at).toLocaleString("zh-CN")
                : "—"}
            </Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {task.command && (
        <Card
          title="启动命令"
          style={{ background: "#1f1f1f", borderColor: "#303030", marginBottom: 16 }}
        >
          <pre
            style={{
              background: "#0d1117",
              color: "#c9d1d9",
              padding: 16,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
              overflowX: "auto",
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {task.command}
          </pre>
        </Card>
      )}

      <Card
        title="日志输出"
        style={{ background: "#1f1f1f", borderColor: "#303030" }}
      >
        <div
          style={{
            background: "#0d1117",
            color: "#8b949e",
            padding: 24,
            borderRadius: 6,
            minHeight: 200,
            fontFamily: "'Fira Code', 'Cascadia Code', 'Consolas', monospace",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          日志终端将在后续版本中集成 (Phase 2)
        </div>
      </Card>
    </div>
  );
};

export default TaskDetail;
