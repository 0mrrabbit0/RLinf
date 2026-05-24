import React from "react";
import { Form, Input, Button, Card, Typography, message } from "antd";
import { SaveOutlined } from "@ant-design/icons";

const { Title } = Typography;

interface SettingsValues {
  rlinf_repo_path: string;
  python_path: string;
  ssh_key_path: string;
  api_url: string;
}

const Settings: React.FC = () => {
  const [form] = Form.useForm<SettingsValues>();

  const handleSave = (values: SettingsValues) => {
    // In Phase 2, this will persist to the Tauri store or backend
    localStorage.setItem("rlinf_settings", JSON.stringify(values));
    message.success("设置已保存");
  };

  const saved = React.useMemo<Partial<SettingsValues>>(() => {
    try {
      return JSON.parse(localStorage.getItem("rlinf_settings") ?? "{}");
    } catch {
      return {};
    }
  }, []);

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <Title level={3} style={{ color: "rgba(255,255,255,0.85)", marginBottom: 24 }}>
        设置
      </Title>

      <Card style={{ background: "#1f1f1f", borderColor: "#303030" }}>
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSave}
          initialValues={{
            rlinf_repo_path: saved.rlinf_repo_path ?? "",
            python_path: saved.python_path ?? "",
            ssh_key_path: saved.ssh_key_path ?? "",
            api_url: saved.api_url ?? "http://localhost:18721",
          }}
        >
          <Form.Item
            label="RLinf 仓库路径"
            name="rlinf_repo_path"
            tooltip="本地 RLinf 代码仓库的绝对路径"
          >
            <Input placeholder="/home/user/RLinf" />
          </Form.Item>

          <Form.Item
            label="Python 解释器路径"
            name="python_path"
            tooltip="用于启动训练的 Python 解释器路径"
          >
            <Input placeholder="/usr/bin/python3 或 conda 环境路径" />
          </Form.Item>

          <Form.Item
            label="SSH 密钥路径"
            name="ssh_key_path"
            tooltip="用于连接远程节点的 SSH 私钥路径"
          >
            <Input placeholder="~/.ssh/id_rsa" />
          </Form.Item>

          <Form.Item
            label="API 后端地址"
            name="api_url"
            tooltip="RLinf Studio 后端 API 地址"
            rules={[{ required: true, message: "请输入 API 地址" }]}
          >
            <Input placeholder="http://localhost:18721" />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              block
            >
              保存设置
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;
