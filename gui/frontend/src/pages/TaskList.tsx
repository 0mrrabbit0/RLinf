import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Table, Badge, Button, Space, Typography } from "antd";
import { PlusOutlined, EyeOutlined, StopOutlined } from "@ant-design/icons";
import { getTasks, stopTask } from "@/utils/api";
import type { TaskStatus } from "@/types/task";
import type { ColumnsType } from "antd/es/table";

const { Title } = Typography;

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

const TaskList: React.FC = () => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<TaskStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = () => {
    setLoading(true);
    getTasks()
      .then(setTasks)
      .catch(() => {
        // Backend not available
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleStop = async (id: string) => {
    try {
      await stopTask(id);
      fetchTasks();
    } catch {
      // Ignore errors
    }
  };

  const columns: ColumnsType<TaskStatus> = [
    {
      title: "任务名称",
      dataIndex: "name",
      key: "name",
      render: (text: string, record: TaskStatus) => (
        <a onClick={() => navigate(`/tasks/${record.id}`)}>{text}</a>
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status: string) => {
        const meta = STATUS_MAP[status] ?? { status: "default" as const, text: status };
        return <Badge status={meta.status} text={meta.text} />;
      },
    },
    {
      title: "模板",
      dataIndex: "template_id",
      key: "template_id",
      width: 180,
      render: (val: string | undefined) => val ?? "—",
    },
    {
      title: "创建时间",
      dataIndex: "started_at",
      key: "started_at",
      width: 200,
      render: (val: string | undefined) =>
        val ? new Date(val).toLocaleString("zh-CN") : "—",
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_: unknown, record: TaskStatus) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => navigate(`/tasks/${record.id}`)}
          >
            详情
          </Button>
          {record.status === "running" && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleStop(record.id)}
            >
              停止
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Title level={3} style={{ color: "rgba(255,255,255,0.85)", margin: 0 }}>
          云边联合任务
        </Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => navigate("/templates")}
        >
          创建任务
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 20 }}
        style={{ background: "#1f1f1f" }}
      />
    </div>
  );
};

export default TaskList;
